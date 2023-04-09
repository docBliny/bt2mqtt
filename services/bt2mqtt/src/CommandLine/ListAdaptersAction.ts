import { DeviceManager } from "@docbliny/bluetooth";
import { Colors } from "@rushstack/node-core-library";
import { ActionBase } from "./ActionBase.js";

/**
 * Prints all available Bluetooth adapters.
 */
export class ListAdaptersAction extends ActionBase {
  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor() {
    super({
      actionName: "list-adapters",
      summary: "Prints all available Bluetooth adapters",
      documentation: "Use this to get a list of available Bluetooth adapter names",
    });
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  protected async onExecute(): Promise<void> {
    const deviceManager = new DeviceManager(this.terminal, {
      discoveryInterval: 1000,
      discoveryTimeout: 1000,
      maxConnectRetries: 0,
    });

    try {
      const adapters = await deviceManager.getAdapters();

      if (adapters.length > 0) {
        this.terminal.writeLine(Colors.green("The following adapters were found:"));
        adapters.forEach((adapter) => {
          this.terminal.writeLine(Colors.blue(adapter));
        });
      } else {
        this.terminal.writeLine(Colors.yellow("No adapters found."));
      }
    } catch (e) {
      this.terminal.writeError(e);
    } finally {
      await deviceManager.dispose();
    }
  }
}
