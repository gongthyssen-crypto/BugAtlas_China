param(
  [Parameter(Mandatory = $true)][string]$Text,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$Voice = 'Microsoft Yaoyao',
  [int]$Rate = 0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$available = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
$selected = @($Voice, 'Microsoft Yaoyao', 'Microsoft Huihui', 'Microsoft Kangkang') | Where-Object { $available -contains $_ } | Select-Object -First 1
if ($selected) { $synth.SelectVoice($selected) }
$synth.Rate = [Math]::Max(-5, [Math]::Min(5, $Rate))
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($OutputPath, $format)
$synth.Speak($Text)
$synth.Dispose()
