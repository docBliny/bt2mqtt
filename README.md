# bt2mqtt
A library and application to connect Bluetooth devices to home automation systems via MQTT.

As usual, ABSOLUTELY NO WARRANTY. Use at your own risk!

## Description
The primary application connects to one or more supported Bluetooth devices (see below) and allows reporting and control of them over MQTT.
You will need a working home automation system, such as Home Assistant, and a running MQTT server for communication.

The application is fairly aggressive in maintaining a connection with devices in an attempt to be as reliable as possible.
However, this does have the downside of possibly using more than usual power of battery powered devices.
This is especially true if your host device and the connected Bluetooth devices have a weak connection.

## Compatibility
A Linux based host machine with DBus and Bluetooth is required. This can be a Raspberry Pi (Zero W and up).

## Supported IOT devices
* My Smart Blinds

### My Smart Blinds
* Blinds currently need to be configured and calibrated using their app
* You will need the passkey and MAC address for each blind. These have traditionally been available via the existing Home Assistant custom component debug logging (https://github.com/docBliny/ha-mysmartblinds). The goal is to create a command line option to sign into the MSB account and automatically print out the required configuration.

## Wishful thinking on additional, future device support
* Ooler
* Prodigy 2 adjustable bed frame
* (Old) LifeSpan treadmill

## Running with Docker on Raspberry Pi

### Installing Docker
Please follow the official documentation for installing Docker on Raspberry Pi. The main tips are listed below for convenience for Raspberry OS.
```bash
sudo apt update && sudo apt upgrade -y

# Make sure to reboot after initial package updates or you'll get various Docker startup errors,
# such as "Failed to start Docker Application Container Engine."
sudo reboot

# Note: Make sure your locale settings match or Docker may run into install issues. RPi uses UK by default
sudo raspi-config

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add pi user to Docker group. NOTE! The docker group grants root-level privileges to the user.
sudo groupadd docker
sudo usermod -aG docker pi

# Sign out or you'll see errors such as "permission denied while trying to connect to the Docker daemon"
exit
```

Remember to sign out and back in to make sure the group/permission changes get applied.

### Stopping Bluetooth on the host Pi
Make sure to stop `bluez`/`bluetoothd` on the host Pi. Otherwise the Docker container will not be able to access the Bluetooth adapter.
```bash
# Disable bluetooth permanently
sudo systemctl disable bluealsa.service
sudo systemctl disable bluetooth.service

# Stop bluetooth service if it's currently running
sudo service bluetooth stop
```

Note: `hciuart.service` may start `bluetooth` on the host (even with `bluetooth` disabled), but disabling it will also disable Bluetooth for use in the Docker container.

```bash
sudo systemctl enable hciuart.service
```

### Configuration file
The following shows an example of the configuration file.
```yaml
## Optional `adapter` section allows selecting an alternate Bluetooth device.
## NOTE: Not supported by Docker image currently
# adapter:
  # name: hci02

## Optional settings to adjust Bluetooth discovery. Times are in seconds
# bluetooth:
#   device_discovery_interval: 1
#   device_discovery_timeout: 60

## Configure the MQTT settings below for your network
mqtt:
  # client_id: "Optional - leave empty for random"
  host: mqtt.mynetwork.net
  port: 1883
  username: mqtt-bt2mqtt
  password: "OVERRIDE_WITH_BT2MQTT_MQTT_PASSWORD"

## Optional overrides for Home Assistant MQTT discovery
# homeassistant:
#   discovery_enabled: true
#   discovery_prefix: "homeassistant"

## Required configuration for smart blinds
smart_blinds:
  ## Optional maximum retries for connecting to device.
  ##
  ## Set to -1 for no limit, but watch out for battery drain.
  max_connect_retries: 10

  ## The blinds this instance should bridge
  ##
  ## You may set either the encoded MAC address and passkey or unencrypted strings
  blinds:
    - name: Dining Room Blinds
      encoded_mac: "aAbBcCdD"
      encoded_passkey: "eEfFgG"

    - name: Kitchen
      mac: AA:BB:CC:DD:EE:FF
      passkey: "000102030405"
```

### Starting bt2mqtt
You will need create to a configuration file that defines the devices you want managed. Add the configuration file on the host machine and create a volume mapping in the Docker container.

While it's possible to set the password for MQTT in the configuration file, you can also use the environment variable `BT2MQTT_MQTT_PASSWORD` to avoid hardcoding the password in the configuration file. You can also set the password as an environment variable on the host and pass into the container's environment variable.

Since Bluetooth is considered a network adapter, the Docker container requires access to be granted using the `--net=host` and `--cap-add=NET_ADMIN` settings.

#### Running manually
```bash
# Start using `Detached (-d)`
docker run -d \
  --net=host --cap-add=NET_ADMIN \
  --name bt2mqtt \
  --restart=unless-stopped \
  -e BT2MQTT_MQTT_PASSWORD=${BT2MQTT_MQTT_PASSWORD} \
  -e BT2MQTT_DEBUG="true" \
  -e BT2MQTT_VERBOSE="true" \
  -v /home/pi/bt2mqtt.yaml:/data/bt2mqtt.yaml:ro \
  docbliny/bt2mqtt:latest
```

Note:
* You need to set the `BT2MQTT_MQTT_PASSWORD` on the host machine. It is then passed into the container.
* You need to create the configuration file on the host at `/home/pi/bt2mqtt.yaml`. You can override the path with `BT2MQTT_CONFIG_FILE` if necessary
* Remove `--restart=unless-stopped` if you're troubleshooting, especially on low-powered devices, such as the Raspberry Pi Zero so you can better control when the container restarts

It also sets both debug and verbose logging on. Once things are running, you'll likely want to turn off both.

If you have a previous instance that was started, you may need to run `docker rm -f bt2mqtt` first.

#### Running with Docker Compose
You can also create a `docker-compose.yml` file to mange the settings. Just remember to add all the required parameters as shown in the manual example above.

## Troubleshooting
* Most startup issues are likely to be caused by issues starting DBus or Bluetooth (bluez) or connecting to the Bluetooth adapter.
* Issues connecting to blinds are likely to be caused by Bluetooth range and/or the battery level of the blinds. Try moving the bridge device closer or using an additional bridge device for blinds that are further away.
* Try restarting the host
* Make sure you don't run multiple copies of the image on the same host or have other containers using Bluetooth
* `No default controller available`: Make sure `bluetooth` is stopped on the host

### View bt2mqtt logs
`docker logs -f bt2mqtt` will display the log output generated by bt2mqtt. Press Ctrl-C to stop.

### Run the Docker image as root for debugging
The following will allow you to run as `root` in the Docker container and thus install any additional debugging tools you may need.

Note that the container runs Alpine Linux, so you'll need to use Alpine version of Linux commands. For example, `ash` is the default shell, not `bash` and adding packages is performed with `apk`, not `apt`.
```bash
docker run -it -u root docbliny/bt2mqtt:latest ash
```

Alternately, you can connect to a running container with:
```bash
docker exec -it -u root bt2mqtt ash
```

If you eed to test with the `bt2mqtt` user's permissions, just leave off the `-u root`.

You can then attempt to run each of the steps in the `/entrypoint.sh` file to see which one is failing and troubleshoot them individually.

Remember to stop and remove any debugging containers once you're done.

### Troubleshooting DBus
I'm getting `dbus[165]: arguments to dbus_connection_get_object_path_data() were incorrect`. This usually means that `dbus` is not running and you'll need to run `rc-service dbus restart`. If you get this, you'll also need to restart `bluetooth` with `rc-service bluetooth restart`.

### Troubleshooting Bluetooth
You can use the `bluetoothctl` command to troubleshoot Bluetooth issues.
```bash
# Run as root via `sudo` (or `sudo -s`)
bluetoothctl
```

Common commands include `power off` and `power on` to restart the adapter, and `list` and `show` to view information.

As mentioned above, if you get `No default controller available`, then make sure the `bluetooth` service is not running on host machine.

## Miscellaneous
* If the app gets stuck or crashes while Bluetooth discovery is running, there will likely be a lot of disk activity. Bluez maintains a cache in `/tmp/bluez` and will write there every time a device is found when discovery is active. This can cause excess wear on SD cards!

## Acknowledgements
* `dbus` library by Andrey Sidorov (sidorares) forked from https://github.com/dbusjs/node-dbus-next (MIT License)
* `node-ble` by Christian Vadalà (chrvadala) forked from https://github.com/chrvadala/node-ble (MIT License)
* "How to run containerized Bluetooth applications with BlueZ" by Thomas Huffert - https://medium.com/omi-uulm/how-to-run-containerized-bluetooth-applications-with-bluez-dced9ab767f6

All trademarks are the property of their respective owners. Use here does not imply support for or by the respective vendors.
