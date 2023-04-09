export const ACK_CHARACTERISTIC_UUID: string = "00001503-1212-efde-1600-785feabcd123";
export const ANGLE_CHARACTERISTIC_UUID: string = "00001403-1212-efde-1600-785feabcd123";
export const CALIBRATION_CHARACTERISTIC_UUID: string = "0000140a-1212-efde-1600-785feabcd123";
export const DAYLIGHT_SAVING_TIME_CHARACTERISTIC: string = "00001502-1212-efde-1600-785feabcd123";
export const NAME_CHARACTERISTIC_UUID: string = "00001401-1212-efde-1600-785feabcd123";
export const PASSKEY_CHARACTERISTIC_UUID: string = "00001409-1212-efde-1600-785feabcd123";
export const ROOM_SETTINGS_CHARACTERISTIC_UUID: string = "00001603-1212-efde-1600-785feabcd123";
export const RX_TX_CHARACTERISTIC_UUID: string = "00001407-1212-efde-1600-785feabcd123";
export const SCHEDULE_CHARACTERISTIC_UUID: string = "00001501-1212-efde-1600-785feabcd123";
export const SENSORS_CHARACTERISTIC_UUID: string = "00001651-1212-efde-1600-785feabcd123";
export const STATUS_CHARACTERISTIC_UUID: string = "00001402-1212-efde-1600-785feabcd123";
export const TIME_CHARACTERISTIC_UUID: string = "00001405-1212-efde-1600-785feabcd123";
export const VERSION_INFO_CHARACTERISTIC_UUID: string = "00001404-1212-efde-1600-785feabcd123";

export const SERVICE_DATA_PARCEL_UUID: string = "00000add-0000-1000-8000-00805f9b34fb";

export const CONFIG_DESCRIPTOR_UUID: string = "00002902-0000-1000-8000-00805f9b34fb";

export const UNKNOWN1_UUID: string = "00001801-0000-1000-8000-00805f9b34fb";
export const UNKNOWN2_UUID: string = "00001530-1212-efde-1523-785feabcd123";
export const UNKNOWN3_SERVICE_UUID: string = "00001400-1212-efde-1600-785feabcd123";

export const MIN_ANGLE: number = 0;
export const MAX_ANGLE: number = 200;

// export const STATUS_COMMAND_NORMAL_ROTATION: number = 0x00;
// export const STATUS_COMMAND_REVERSE_ROTATION: number = 0x01;
// export const STATUS_COMMAND_CALIBRATE: number = 0x04;
export const STATUS_COMMAND_IDENTIFY: number = 0x08;
// export const STATUS_COMMAND_RESET_PASSCODE: number = 0x2000;
// export const STATUS_COMMAND_FACTORY_RESET: number = 0x4000;

export const NACK_COMMAND_INVALID: number = 0;
export const NACK_PASSKEY_INVALID: number = 16;
export const NACK_PASSKEY_NOT_READY: number = 17;
export const NACK_FILE_ERROR: number = 32;
export const NACK_FILE_BUSY: number = 33;
// export const NACK_INVALID = null;

export const CALIBRATION_TX_COMMAND_NACK: number = 0;
export const CALIBRATION_TX_COMMAND_ACK: number = 1;
export const CALIBRATION_TX_COMMAND_GET: number = 96;
export const CALIBRATION_TX_COMMAND_SET: number = 97;
export const CALIBRATION_TX_COMMAND_MOVE: number = 98;
export const CALIBRATION_TX_COMMAND_MOVE_TO_POSITION: number = 99;
export const CALIBRATION_TX_COMMAND_CLEAR: number = 100;

export const FIRMWARE_TX_COMMAND_FILE_START: number = 80;
export const FIRMWARE_TX_COMMAND_BLOCK_START: number = 81;
export const FIRMWARE_TX_COMMAND_BLOCK_DATA: number = 82;
export const FIRMWARE_TX_COMMAND_VALIDATE: number = 83;
export const FIRMWARE_TX_COMMAND_FINALIZE: number = 84;
export const FIRMWARE_TX_COMMAND_ABORT: number = 85;
// export const FIRMWARE_TX_COMMAND_INVALID = null;

export const FIRMWARE_RX_COMMAND_NACK: number = 0;
export const FIRMWARE_RX_COMMAND_ACK: number = 1;
export const FIRMWARE_RX_COMMAND_FILE_START: number = FIRMWARE_TX_COMMAND_FILE_START;

export const CHARACTERISTIC_NAMES: Record<string, string> = {
  [ACK_CHARACTERISTIC_UUID]: "Ack",
  [ANGLE_CHARACTERISTIC_UUID]: "Angle",
  [CALIBRATION_CHARACTERISTIC_UUID]: "Calibration",
  [DAYLIGHT_SAVING_TIME_CHARACTERISTIC]: "Daylight Saving Time",
  [NAME_CHARACTERISTIC_UUID]: "Name",
  [PASSKEY_CHARACTERISTIC_UUID]: "Passkey",
  [ROOM_SETTINGS_CHARACTERISTIC_UUID]: "Room Settings",
  [RX_TX_CHARACTERISTIC_UUID]: "Rx/Tx",
  [SCHEDULE_CHARACTERISTIC_UUID]: "Schedule",
  [SENSORS_CHARACTERISTIC_UUID]: "Sensors",
  [STATUS_CHARACTERISTIC_UUID]: "Status",
  [TIME_CHARACTERISTIC_UUID]: "Time",
  [VERSION_INFO_CHARACTERISTIC_UUID]: "Version Info",
};

export const IS_NORMAL: number = 0x00000000;
export const IS_REVERSED: number = 0x00000001;
// export const IS_PAIRED: number             = 0x00000000;
export const IS_BONDING: number = 0x00000002;
export const IS_CALIBRATED: number = 0x00010000;
export const HAS_SOLAR: number = 0x00020000;
export const IS_CHARGING_SOLAR: number = 0x00040000;
export const IS_CHARGING_USB: number = 0x00080000;
export const IS_TIME_VALID: number = 0x00100000;
export const UNDER_VOLTAGE_LOCKOUT: number = 0x00200000;
export const IS_OVER_TEMP: number = 0x00400000;
export const TEMP_OVERRIDE: number = 0x00800000;

// export const IS_PASSKEY_INVALID: number    = 0x00000000;
export const IS_PASSKEY_VALID: number = 0x80000000;

export const TIME_FORMAT: number = 0x14;
export const TIME_OFFSET: number = 0x20;
