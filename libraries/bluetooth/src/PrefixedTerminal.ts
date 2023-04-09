import { Colors, IColorableSequence, ITerminal } from "@rushstack/node-core-library";

export class PrefixedTerminal {
  // **************************************** //
  // Protected properties
  // **************************************** //
  protected readonly terminal: ITerminal;

  // **************************************** //
  // Private properties
  // **************************************** //
  private _prefix: IColorableSequence | string = "";

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(terminal: ITerminal, prefix: string) {
    this.terminal = terminal;
    this.setPrefix(prefix);
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public toISOStringWithTimezone = (date: Date): string => {
    const tzOffset: number = -date.getTimezoneOffset();
    const diff: string = tzOffset >= 0 ? "+" : "-";
    const pad = (n: number): string => `${Math.floor(Math.abs(n))}`.padStart(2, "0");
    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      "T" +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes()) +
      ":" +
      pad(date.getSeconds()) +
      diff +
      pad(tzOffset / 60) +
      ":" +
      pad(tzOffset % 60)
    );
  };

  public setPrefix(prefix: string): void {
    this._prefix = prefix;
  }

  public getActivePrefix(): IColorableSequence | string {
    return Colors.gray(`[${this.toISOStringWithTimezone(new Date())}] [${this._prefix}] `);
  }

  public write(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.write(this.getActivePrefix(), ...messageParts);
  }

  public writeLine(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeLine(this.getActivePrefix(), ...messageParts);
  }

  public writeError(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeError(this.getActivePrefix(), ...messageParts);
  }

  public writeErrorLine(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeErrorLine(this.getActivePrefix(), ...messageParts);
  }

  public writeWarning(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeWarning(this.getActivePrefix(), ...messageParts);
  }

  public writeWarningLine(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeWarningLine(this.getActivePrefix(), ...messageParts);
  }

  public writeVerbose(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeVerbose(this.getActivePrefix(), ...messageParts);
  }

  public writeVerboseLine(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeVerboseLine(this.getActivePrefix(), ...messageParts);
  }

  public writeDebug(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeDebug(this.getActivePrefix(), ...messageParts);
  }

  public writeDebugLine(...messageParts: Array<string | IColorableSequence>): void {
    this.terminal.writeDebugLine(this.getActivePrefix(), ...messageParts);
  }
}
