import process from "node:process";
import { Application } from "./Application.js";
import { ConsoleTerminalProvider, ITerminal, Terminal } from "@rushstack/node-core-library";
import { Config } from "./Config.js";
const APPLICATION_NAME: string = "bt2mqtt";

let shuttingDown: boolean = false;
let app: Application;
let terminal: ITerminal;

export interface IMainOptions {
  configFilePath: string;
  debug: boolean;
  verbose: boolean;
  terminal?: ITerminal;
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (!shuttingDown) {
    shuttingDown = true;
    terminal.writeLine(`${APPLICATION_NAME}: ${reason} - Shutting down...`);
    await app.dispose();

    process.exit();
  }
}

export async function launch(options: IMainOptions): Promise<void> {
  if (!options.terminal) {
    terminal = new Terminal(
      new ConsoleTerminalProvider({
        debugEnabled: options.debug,
        verboseEnabled: options.verbose,
      }),
    );
  } else {
    terminal = options.terminal;
  }

  terminal.writeVerboseLine("Reading application configuration...");
  const config = new Config(terminal);
  config.initializeFromConfigFile(options.configFilePath);

  terminal.writeVerboseLine("Creating application instance...");
  app = new Application(terminal, config);

  process.addListener("unhandledRejection", async (error) => {
    // Use native console
    console.error("unhandledRejection", error);

    // // If this is an error from Bluez, we'd best exit or get stuck in an infinite loop
    // // @ts-expect-error
    // if(error && (error.type && error.type.includes("org.bluez.Error"))) {
    //   await shutdown("unhandledRejection", -1);
    // }
  });

  process.addListener("uncaughtException", async (error) => {
    // Use native console
    console.error(error);

    await shutdown("uncaughtException", -1);
  });

  // Hook up interrupt handlers
  terminal.writeVerboseLine("Adding interrupt handlers...");
  process.addListener("SIGINT", async function () {
    if (!shuttingDown) {
      await shutdown("SIGINT", 0);
    } else {
      terminal.writeLine("SIGINT received while shutting down, exiting immediately");
      process.exit(-1);
    }
  });

  process.addListener("SIGQUIT", async function () {
    await shutdown("SIGQUIT", 0);
  });

  process.addListener("SIGTERM", async function () {
    await shutdown("SIGTERM", 0);
  });

  // Start the application listening
  terminal.writeLine("Launching application...");

  try {
    await app.initialize();
    await app.start();
  } catch (error) {
    // Use native console
    console.error(error);

    await shutdown(`Application error ${error.stack}`, -1);
  }
}
