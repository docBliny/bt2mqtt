import { ActionBase } from "./ActionBase.js";
import { launch } from "../Main.js";
import { CommandLineStringParameter } from "@rushstack/ts-command-line";

/**
 * Prints all available Bluetooth adapters.
 */
export class StartAction extends ActionBase {
  // **************************************** //
  // Private fields
  // **************************************** //
  private _configFilePathParameter!: CommandLineStringParameter;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor() {
    super({
      actionName: "start",
      summary: "Starts the Bluetooth-to-MQTT service",
      documentation: "Use this to start the service",
    });
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  /**
   * @inheritdoc
   */
  protected onDefineParameters(): void {
    super.onDefineParameters();

    this._configFilePathParameter = this.defineStringParameter({
      argumentName: "CONFIG",
      description: "Configuration file path",
      parameterLongName: "--config",
      parameterShortName: "-c",
      required: true,
    });
  }

  /**
   * @inheritdoc
   */
  protected async onExecute(): Promise<void> {
    await super.onExecute();

    await launch({
      configFilePath: this._configFilePathParameter.value!,
      debug: this._debugEnabledParameter.value,
      terminal: this.terminal,
      verbose: this._verboseEnabledParameter.value,
    });
  }
}
