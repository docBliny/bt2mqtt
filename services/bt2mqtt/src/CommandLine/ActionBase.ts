import { ConsoleTerminalProvider, ITerminal, Terminal } from "@rushstack/node-core-library";
import { CommandLineAction, CommandLineFlagParameter, ICommandLineActionOptions } from "@rushstack/ts-command-line";

/**
 * Prints all available Bluetooth adapters.
 */
export abstract class ActionBase extends CommandLineAction {
  // **************************************** //
  // Protected properties
  // **************************************** //
  protected terminal!: ITerminal;
  protected _debugEnabledParameter!: CommandLineFlagParameter;
  protected _verboseEnabledParameter!: CommandLineFlagParameter;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(options: ICommandLineActionOptions) {
    super(options);
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  protected onDefineParameters(): void {
    this._debugEnabledParameter = this.defineFlagParameter({
      parameterLongName: "--debug",
      parameterShortName: "-d",
      description: "Enable debug logging.",
    });

    this._verboseEnabledParameter = this.defineFlagParameter({
      parameterLongName: "--verbose",
      description: "Enable verbose logging.",
    });
  }

  protected async onExecute(): Promise<void> {
    this.terminal = new Terminal(
      new ConsoleTerminalProvider({
        debugEnabled: this._debugEnabledParameter.value,
        verboseEnabled: this._verboseEnabledParameter.value,
      }),
    );
  }
}
