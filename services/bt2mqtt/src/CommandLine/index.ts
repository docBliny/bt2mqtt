import { BT2MqttCommandLine } from "./BT2MqttCommandLine.js";

const commandLine: BT2MqttCommandLine = new BT2MqttCommandLine();
commandLine.execute().catch(console.error); // CommandLineParser.execute() should never reject the promise
