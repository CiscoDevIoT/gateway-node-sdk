// Copyright 2015 Cisco Systems, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License. You may obtain
// a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.

import EventEmitter from "events";
import mqtt from "mqtt";
import url from "url";

export default class MqttConnector extends EventEmitter {
    constructor(gateway, mqttServer) {
        super();
        let ns = gateway.owner.replace('@', '-').replace('.', '-').replace('/', '-');
        if(ns == "") ns = "_";
        let name = gateway.name.replace("/", "_");
        let mqtt_url = url.parse(mqttServer);
		
		Object.assign(this,{
			gateway,
			mqttServer,
			connected:false,
			data:`/deviot/${ns}/${name}/data/`,
			action:`/deviot/${ns}/${name}/action/`,
			host:mqtt_url.hostname,
			port:mqtt_url.port || 1883
		})
    }

    start() {
        if(!this.connected) {
            console.info("connecting to " + this.mqttServer + " ...");
            this.client = mqtt.connect(this.mqttServer, {clean: true});
            this.client.on('connect', () => {
                this.connected = true;
                this.emit('connect', null);
                this.client.subscribe(this.action);
                console.info(`mqtt server ${this.mqttServer} connected`);
            });

            this.client.on('message', (topic, message, packet) => {
                let action = JSON.parse(message);
                this.emit('action', action)
            });
        } else {
            console.info("mqtt connector already started")
        }
    }

    stop() {
        if(this.connected) {
            this.connected = false;
            this.client.unsubscribe(this.action);
            this.client.end();
            console.info(`mqtt server ${this.mqttServer} disconnected`);
        } else {
            console.info("mqtt connector not started yet")
        }
    }

    publish(data) {
        this.client.publish(this.data, JSON.stringify(data))
    }
}
