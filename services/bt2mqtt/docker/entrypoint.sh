#!/bin/bash

function wait_for_service_stop() {
    local service=$1
    local msg="Waiting for service to start..."
    local time=0
    echo -n $msg
    while [[ "$(pidof $service)" != "" ]]; do
        sleep 1
        time=$((time + 1))
        echo -en "\r$msg $time s"
    done
    echo -e "\r$msg done! (in $time s)"
}

# Start required services
sudo rc-status

sudo rc-service dbus restart
wait_for_service_stop start-stop-daemon

sudo rc-service bluetooth restart
wait_for_service_stop start-stop-daemon

# Reset bluetooth adapter by restarting it to avoid random startup issues
echo -e "\rRestarting bluetooth adapter..."
sudo bluetoothctl --timeout 15 power off
sudo bluetoothctl --timeout 15 power on

# Check if debug output is enabled
DEBUG_OUTPUT_FLAG=""
if [[ "${BT2MQTT_DEBUG}" == "true" ]]; then
    echo -e "\rDebug output enabled"
    DEBUG_OUTPUT_FLAG="--debug"
fi

# Check if verbose output is enabled
VERBOSE_OUTPUT_FLAG=""
if [[ "${BT2MQTT_VERVOSE}" == "true" ]]; then
    echo -e "\rVerbose output enabled"
    VERBOSE_OUTPUT_FLAG="--verbose"
fi

# Start application
echo -e "\rStarting bt2mqtt..."
FORCE_COLOR=1 node /usr/src/app/services/bt2mqtt/lib/CommandLine/index.js start ${DEBUG_OUTPUT_FLAG} ${VERBOSE_OUTPUT_FLAG} --config ${BT2MQTT_CONFIG_FILE:-/data/bt2mqtt.yaml}
