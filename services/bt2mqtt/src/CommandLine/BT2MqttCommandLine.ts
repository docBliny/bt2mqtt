import { CommandLineParser } from "@rushstack/ts-command-line";
import { ListAdaptersAction } from "./ListAdaptersAction.js";
import { StartAction } from "./StartAction.js";

export class BT2MqttCommandLine extends CommandLineParser {
  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor() {
    super({
      toolFilename: "bt2mqtt",
      toolDescription: "Bluetooth IOT device bridge to MQTT",
    });

    this.addAction(new ListAdaptersAction());
    this.addAction(new StartAction());
  }
}
