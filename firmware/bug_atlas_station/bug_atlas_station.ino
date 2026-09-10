#include <Arduino.h>
#include <avr/wdt.h>
#include "protocol_types.h"

#define ENABLE_PIR 1
#define DEBUG_DISABLE_WATCHDOG 0

namespace Pins {
constexpr uint8_t DHT = 2;
constexpr uint8_t PIR = 3;
constexpr uint8_t LIGHT = A0;
constexpr uint8_t LED = LED_BUILTIN;
}

namespace Protocol {
constexpr uint8_t PREAMBLE_0 = 0xAA;
constexpr uint8_t PREAMBLE_1 = 0x55;
constexpr uint8_t VERSION = 0x01;
constexpr uint8_t HELLO = 0x01;
constexpr uint8_t SENSOR_REPORT = 0x02;
constexpr uint8_t EVENT_REPORT = 0x03;
constexpr uint8_t CONFIG_SET = 0x10;
constexpr uint8_t CONFIG_ACK = 0x11;
constexpr uint8_t PING = 0x12;
constexpr uint8_t PONG = 0x13;
constexpr uint8_t ERROR = 0x7F;
constexpr uint8_t ACK_REQUIRED = 0x01;
constexpr uint8_t IS_ACK = 0x02;
constexpr uint8_t IS_ERROR = 0x04;
constexpr uint16_t MAX_PAYLOAD = 128;
}

namespace Status {
constexpr uint16_t DHT_VALID = 1 << 0;
constexpr uint16_t LIGHT_VALID = 1 << 1;
constexpr uint16_t PIR_VALID = 1 << 2;
constexpr uint16_t CONFIG_VALID = 1 << 3;
constexpr uint16_t SERIAL_OVERFLOW = 1 << 4;
constexpr uint16_t WATCHDOG_RESET = 1 << 5;
}

enum DeviceState : uint8_t { INITIALIZING = 0, RUNNING = 1, DEGRADED = 2, FAULT = 3 };

uint8_t resetCause __attribute__((section(".noinit")));
void captureResetCause() __attribute__((naked)) __attribute__((section(".init3")));
void captureResetCause() {
  resetCause = MCUSR;
  MCUSR = 0;
  wdt_disable();
}

struct Reading {
  int16_t temperatureDeciC = INT16_MIN;
  uint16_t humidityDeciPct = UINT16_MAX;
  uint16_t lightRaw = UINT16_MAX;
  uint8_t pirState = 0xFF;
  uint16_t status = 0;
  DeviceState state = INITIALIZING;
};

Reading reading;
RxFrame rxFrame;
uint16_t txSequence = 0;
uint16_t sampleCounter = 0;
uint16_t sampleIntervalMs = 2000;
uint16_t reportIntervalMs = 2000;
uint32_t lastSampleAt = 0;
uint32_t lastReportAt = 0;
uint32_t lastLedAt = 0;
uint32_t lastHelloAt = 0;
uint32_t saturationStartedAt = 0;
uint8_t dhtFailureCount = 0;
uint8_t dhtRecoveryCount = 0;
uint8_t helloCount = 0;
bool configured = false;
bool ledOn = false;
bool lastPirState = false;

uint16_t crc16Ccitt(const uint8_t* data, size_t length) {
  uint16_t crc = 0xFFFF;
  while (length--) {
    crc ^= static_cast<uint16_t>(*data++) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1);
    }
  }
  return crc;
}

void putU16(uint8_t* output, uint16_t value) {
  output[0] = static_cast<uint8_t>(value & 0xFF);
  output[1] = static_cast<uint8_t>(value >> 8);
}

void putI16(uint8_t* output, int16_t value) { putU16(output, static_cast<uint16_t>(value)); }

void putU32(uint8_t* output, uint32_t value) {
  output[0] = static_cast<uint8_t>(value);
  output[1] = static_cast<uint8_t>(value >> 8);
  output[2] = static_cast<uint8_t>(value >> 16);
  output[3] = static_cast<uint8_t>(value >> 24);
}

uint16_t readU16(const uint8_t* input) {
  return static_cast<uint16_t>(input[0]) | (static_cast<uint16_t>(input[1]) << 8);
}

void sendFrame(uint8_t type, uint8_t flags, uint16_t sequence, const uint8_t* payload, uint16_t length) {
  if (length > Protocol::MAX_PAYLOAD) return;
  uint8_t body[8 + Protocol::MAX_PAYLOAD];
  body[0] = Protocol::VERSION;
  body[1] = type;
  body[2] = flags;
  body[3] = 0;
  putU16(body + 4, sequence);
  putU16(body + 6, length);
  if (length && payload) memcpy(body + 8, payload, length);
  const uint16_t crc = crc16Ccitt(body, 8 + length);

  Serial.write(Protocol::PREAMBLE_0);
  Serial.write(Protocol::PREAMBLE_1);
  Serial.write(body, 8 + length);
  Serial.write(static_cast<uint8_t>(crc & 0xFF));
  Serial.write(static_cast<uint8_t>(crc >> 8));
}

void sendHello() {
  uint8_t payload[14] = {'U', 'N', 'O', '0', '0', '0', '0', '1', 0, 1, 0, 0, 0, resetCause};
  const uint16_t capabilities = Status::DHT_VALID | Status::LIGHT_VALID | (ENABLE_PIR ? Status::PIR_VALID : 0) | Status::CONFIG_VALID;
  putU16(payload + 11, capabilities);
  sendFrame(Protocol::HELLO, 0, txSequence++, payload, sizeof(payload));
  helloCount++;
  lastHelloAt = millis();
}

bool waitForLevel(uint8_t level, uint16_t timeoutMicros, uint16_t* duration = nullptr) {
  const uint32_t started = micros();
  while (digitalRead(Pins::DHT) == level) {
    if (micros() - started > timeoutMicros) return false;
  }
  if (duration) *duration = static_cast<uint16_t>(micros() - started);
  return true;
}

bool readDht11(int16_t& temperature, uint16_t& humidity) {
  uint8_t bytes[5] = {0, 0, 0, 0, 0};
  pinMode(Pins::DHT, OUTPUT);
  digitalWrite(Pins::DHT, LOW);
  delay(20);
  digitalWrite(Pins::DHT, HIGH);
  delayMicroseconds(30);
  pinMode(Pins::DHT, INPUT_PULLUP);

  noInterrupts();
  bool ok = waitForLevel(HIGH, 120) && waitForLevel(LOW, 120) && waitForLevel(HIGH, 120);
  for (uint8_t bit = 0; ok && bit < 40; ++bit) {
    uint16_t highDuration = 0;
    ok = waitForLevel(LOW, 100) && waitForLevel(HIGH, 120, &highDuration);
    if (ok && highDuration > 45) bytes[bit / 8] |= static_cast<uint8_t>(1U << (7 - bit % 8));
  }
  interrupts();

  if (!ok || static_cast<uint8_t>(bytes[0] + bytes[1] + bytes[2] + bytes[3]) != bytes[4]) return false;
  humidity = static_cast<uint16_t>(bytes[0]) * 10 + bytes[1];
  const bool negative = bytes[2] & 0x80;
  temperature = static_cast<int16_t>((bytes[2] & 0x7F) * 10 + bytes[3]);
  if (negative) temperature = -temperature;
  return temperature >= -200 && temperature <= 600 && humidity <= 1000;
}

void sampleSensors() {
  int16_t temperature;
  uint16_t humidity;
  if (readDht11(temperature, humidity)) {
    reading.temperatureDeciC = temperature;
    reading.humidityDeciPct = humidity;
    reading.status |= Status::DHT_VALID;
    dhtFailureCount = 0;
    if (dhtRecoveryCount < 3) dhtRecoveryCount++;
  } else {
    dhtRecoveryCount = 0;
    if (dhtFailureCount < 3) dhtFailureCount++;
    if (dhtFailureCount >= 3) {
      reading.temperatureDeciC = INT16_MIN;
      reading.humidityDeciPct = UINT16_MAX;
      reading.status &= ~Status::DHT_VALID;
    }
  }

  const uint16_t light = analogRead(Pins::LIGHT);
  const bool saturated = light <= 2 || light >= 1021;
  if (saturated) {
    if (!saturationStartedAt) saturationStartedAt = millis();
    if (millis() - saturationStartedAt >= 10000UL) {
      reading.lightRaw = UINT16_MAX;
      reading.status &= ~Status::LIGHT_VALID;
    }
  } else {
    saturationStartedAt = 0;
    reading.lightRaw = light;
    reading.status |= Status::LIGHT_VALID;
  }

#if ENABLE_PIR
  const bool pir = digitalRead(Pins::PIR) == HIGH;
  reading.pirState = pir ? 1 : 0;
  reading.status |= Status::PIR_VALID;
  if (pir != lastPirState) {
    uint8_t event[5];
    putU32(event, millis());
    event[4] = reading.pirState;
    sendFrame(Protocol::EVENT_REPORT, 0, txSequence++, event, sizeof(event));
    lastPirState = pir;
  }
#else
  reading.pirState = 0xFF;
  reading.status &= ~Status::PIR_VALID;
#endif

  if (configured) reading.status |= Status::CONFIG_VALID;
  if (resetCause & _BV(WDRF)) reading.status |= Status::WATCHDOG_RESET;
  reading.state = ((reading.status & (Status::DHT_VALID | Status::LIGHT_VALID)) == (Status::DHT_VALID | Status::LIGHT_VALID)) ? RUNNING : DEGRADED;
  sampleCounter++;
}

void sendSensorReport() {
  uint8_t payload[16];
  putU32(payload, millis());
  putI16(payload + 4, reading.temperatureDeciC);
  putU16(payload + 6, reading.humidityDeciPct);
  putU16(payload + 8, reading.lightRaw);
  payload[10] = reading.pirState;
  putU16(payload + 11, reading.status);
  payload[13] = static_cast<uint8_t>(reading.state);
  putU16(payload + 14, sampleCounter);
  sendFrame(Protocol::SENSOR_REPORT, 0, txSequence++, payload, sizeof(payload));
}

void handleFrame(const RxFrame& frame) {
  if (frame.version != Protocol::VERSION) return;
  if (frame.type == Protocol::CONFIG_SET && frame.length == 6) {
    const uint16_t newSampleInterval = readU16(frame.payload);
    const uint16_t newReportInterval = readU16(frame.payload + 2);
    const bool intervalsValid = newSampleInterval >= 2000 && newSampleInterval <= 60000 && newReportInterval >= newSampleInterval && newReportInterval <= 60000;
    const bool pirValid = frame.payload[4] <= 1;
    uint8_t response[7];
    response[0] = intervalsValid && pirValid ? 0 : 1;
    if (!response[0]) {
      sampleIntervalMs = newSampleInterval;
      reportIntervalMs = newReportInterval;
      configured = true;
    }
    putU16(response + 1, sampleIntervalMs);
    putU16(response + 3, reportIntervalMs);
    response[5] = ENABLE_PIR ? frame.payload[4] : 0;
    response[6] = 0;
    sendFrame(Protocol::CONFIG_ACK, Protocol::IS_ACK | (response[0] ? Protocol::IS_ERROR : 0), frame.seq, response, sizeof(response));
  } else if (frame.type == Protocol::PING) {
    sendFrame(Protocol::PONG, Protocol::IS_ACK, frame.seq, frame.payload, frame.length);
  }
}

void receiveFrames() {
  static uint8_t buffer[12 + Protocol::MAX_PAYLOAD];
  static uint16_t used = 0;
  while (Serial.available()) {
    const uint8_t incoming = static_cast<uint8_t>(Serial.read());
    if (used < sizeof(buffer)) buffer[used++] = incoming;
    else {
      used = 0;
      reading.status |= Status::SERIAL_OVERFLOW;
    }

    while (used >= 2 && (buffer[0] != Protocol::PREAMBLE_0 || buffer[1] != Protocol::PREAMBLE_1)) {
      memmove(buffer, buffer + 1, --used);
    }
    if (used < 10) continue;
    const uint16_t length = readU16(buffer + 8);
    if (length > Protocol::MAX_PAYLOAD) {
      memmove(buffer, buffer + 1, --used);
      continue;
    }
    const uint16_t total = 12 + length;
    if (used < total) continue;
    const uint16_t expected = readU16(buffer + 10 + length);
    const uint16_t actual = crc16Ccitt(buffer + 2, 8 + length);
    if (expected == actual) {
      rxFrame.version = buffer[2];
      rxFrame.type = buffer[3];
      rxFrame.flags = buffer[4];
      rxFrame.reserved = buffer[5];
      rxFrame.seq = readU16(buffer + 6);
      rxFrame.length = length;
      if (length) memcpy(rxFrame.payload, buffer + 10, length);
      handleFrame(rxFrame);
    }
    memmove(buffer, buffer + total, used - total);
    used -= total;
  }
}

void updateLed() {
  const uint16_t interval = reading.state == RUNNING ? 1000 : 150;
  if (millis() - lastLedAt >= interval) {
    lastLedAt = millis();
    ledOn = !ledOn;
    digitalWrite(Pins::LED, ledOn ? HIGH : LOW);
  }
}

void setup() {
  pinMode(Pins::LED, OUTPUT);
  pinMode(Pins::LIGHT, INPUT);
#if ENABLE_PIR
  pinMode(Pins::PIR, INPUT);
#endif
  Serial.begin(115200);
  delay(2000);
  sampleSensors();
  sendHello();
#if !DEBUG_DISABLE_WATCHDOG
  wdt_enable(WDTO_8S);
#endif
}

void loop() {
#if !DEBUG_DISABLE_WATCHDOG
  wdt_reset();
#endif
  receiveFrames();
  const uint32_t now = millis();
  if (now - lastSampleAt >= sampleIntervalMs) {
    lastSampleAt = now;
    sampleSensors();
  }
  if (now - lastReportAt >= reportIntervalMs) {
    lastReportAt = now;
    sendSensorReport();
  }
  if (!configured && helloCount < 3 && now - lastHelloAt >= 1000UL) sendHello();
  updateLed();
}
