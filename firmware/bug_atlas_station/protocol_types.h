#pragma once

#include <Arduino.h>

// Kept in a header so Arduino's automatic prototype generator sees this type.
struct RxFrame {
  uint8_t version;
  uint8_t type;
  uint8_t flags;
  uint8_t reserved;
  uint16_t seq;
  uint16_t length;
  uint8_t payload[128];
};
