FROM node:18.14.1-alpine3.17

# Install bluez related packages
RUN apk add --no-cache \
  bluez \
  dbus \
  sudo \
  openrc && \
  mkdir -p /run/openrc && \
  touch /run/openrc/softlevel

# Copy application files
WORKDIR /usr/src/app
COPY ./deploy/ /usr/src/app/

# Setup bluetooth permissions
COPY etc/dbus-1/system.d/bt2mqtt.conf /etc/dbus-1/system.d/

ENV BT2MQTT_USER=bt2mqtt
RUN adduser -H -D -g "${BT2MQTT_USER}" $BT2MQTT_USER && \
  echo "$BT2MQTT_USER ALL=(ALL) NOPASSWD:/bin/rc-status,/sbin/rc-service dbus restart,/sbin/rc-service bluetooth restart,/usr/bin/bluetoothctl" > /etc/sudoers.d/$BT2MQTT_USER && chmod 0440 /etc/sudoers.d/$BT2MQTT_USER
# echo "$BT2MQTT_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$BT2MQTT_USER && chmod 0440 /etc/sudoers.d/$BT2MQTT_USER

USER bt2mqtt

# Setup startup script
COPY entrypoint.sh /
CMD [ "ash", "/entrypoint.sh" ]
