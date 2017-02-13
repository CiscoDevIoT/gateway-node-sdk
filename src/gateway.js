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

import http from "http";
import url from "url";
import EventEmitter from "events";
import MqttConnector from "./mqtt-connector";
import WeakMapForPrivate from './WeakMapForPrivate';

let _registration_timer = WeakMapForPrivate(0);
let _registered = WeakMapForPrivate(0);

export const MODE_HTTP_PULL = 0;
export const MODE_HTTP_PUSH = 1;
export const MODE_MQTT = 2;

let _GateWayPrivates = WeakMapForPrivate();
export default class Gateway extends EventEmitter {
    constructor(name, deviotServer, mqttServer, account, opts) {
        super();
        opts = Object.assign({}, opts);

		let gateway = {
            name: name,
            owner: account || "",
            kind: opts.kind || "device",
            mode: module.exports.MODE_MQTT,
            sensors: [],
			host,
			port,
			data,
			action
        };

		let connector = new MqttConnector(gateway, mqttServer);
		let {host,port,data,action} = connector;


		Object.assign(this,{
			connector,
			deviotServer,
			mqttServer,
			gateway,
			things:{},
			sensors:{}
		});

		let registerGateway = Gateway_registerGateway.bind(this);
		_GateWayPrivates.set(this, new Map());
		_GateWayPrivates.get(this).set('registerGateway', registerGateway);

        this.connector.on('connect', () => {
            registerGateway();
			_registration_timer.set(this, setInterval(registerGateway, 60000));
        });

        this.connector.on('action', (message) => {
            let id = message.name;
            let thing = this.things[id];
            if(thing) {
                callAction(thing, message.action, message)
            } else {
                console.error(`thing ${id} not registered`)
            }
        });
    }

    start() {
        if(_registration_timer.get(this) == 0) {
            this.connector.start();
        } else {
            console.warn("gateway service already started")
        }
    }

    stop() {
        if(_registration_timer.get(this) != 0) {
            this.emit('disconnect', null);
            clearInterval(_registration_timer.get(this));
            _registration_timer.set(this,0);
            this.connector.stop();
            console.info("gateway service stopped")
        } else {
            console.warn("gateway service not started yet")
        }
    }

    register(thing) {
        if (!thing.id || !thing.name) {
            console.error("id and name are required!");
            return
        }
        if (!thing.constructor.model.kind) {
            thing.constructor.model.kind = thing.constructor.name.toLowerCase();
        }
        let thing_model = Object.assign({}, thing.constructor.model);
        thing_model["id"] = thing.id;
        thing_model["name"] = thing.name;
        this.things[thing.id] = thing;
        this.sensors[thing.id] = thing_model;
        console.info(`thing ${thing.id}[${thing.name}(${thing_model.kind})] registered`)
    }

    unregister(id) {
        if(id in this.things) {
            let thing_model = this.sensors[id];
            delete this.things[id];
            delete this.sensors[id];
            console.info(`thing ${id}.${thing_model.name}(${thing_model.kind}) unregistered`)
        } else {
            console.warn(`thing ${id} not been registered yet`)
        }
    }

    sendData(data) {
        this.connector.publish(data);
    }
}

function Gateway_registerGateway() {
	let deviot_url = this.deviotServer;
    deviot_url = url.parse(deviot_url);
    let options = {
        host: deviot_url.hostname,
        port: deviot_url.port,
        path: '/api/v1/gateways',
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
    };
    let gateway = this.gateway;
    let callback = function(response, error) {
        if (response.statusCode < 300) {
            if(_registered.get(this) != 2) {
                console.info(`gateway ${gateway.name} registered`);
                _registered.set(this,2);
            }
        } else {
            if(_registered.get(this) != 1) {
				console.log(response.statusCode, response);
                console.error(`fail to register gateway ${gateway.name}: ${error}`);
                _registered.set(this,1);
            }
        }
    };
    let request = http.request(options, callback);
    gateway.sensors = [];
    for(let k in this.sensors) {
        gateway.sensors.push(this.sensors[k])
    }
    let gateway_json = JSON.stringify(gateway);
    request.write(gateway_json);
    request.on('error', (error) => {
        if(_registered.get(this) != 1) {
            console.error(`fail to register gateway ${gateway.name}: ${error}`);
            _registered.set(this,1);
        }
    });
    request.end()
}

const callAction = function(thing, actionName, data) {
    let args = [];
    for (let action of thing.constructor.model.actions) {
        if (action.name == actionName) {
            if (action.parameters) {
                for (let param of action.parameters) {
                    let value = data[param.name];
                    args.push(value || param.value)
                }
            }
            if (action.need_payload) args.push(data['payload']);
            thing[actionName](...args);
            console.info(`action ${actionName} called on ${thing.id}[${thing.name}(${thing.constructor.model.kind})]`);
            return
        }
    }
    console.error(`action ${actionName} not defined in ${thing.id}[${thing.name}(${thing.constructor.model.kind})]`);
}
