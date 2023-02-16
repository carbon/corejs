"use strict";
var Carbon;
(function (Carbon) {
    Carbon.controllers = {
        get(name) {
            return Carbon.controllers[name];
        },
        set(name, controller) {
            Carbon.controllers[name] = controller;
        }
    };
    Carbon.controllerFactory = Carbon.controllers;
    class Reactive {
        static once(name, callback) {
            let sub = Carbon.Reactive.on(name, callback);
            sub.once = true;
            return sub;
        }
        static on(name, callback) {
            let parts = name.split('.');
            let scope = undefined;
            if (parts.length == 2)
                scope = parts[1];
            let instance = Carbon.Reactive.get(parts[0]);
            return instance.subscribe(callback, { scope: scope });
        }
        static off(name) {
            let parts = name.split('.');
            let scope = (parts.length == 2) ? parts[1] : undefined;
            let instance = Carbon.Reactive.get(parts[0]);
            for (var listener of instance.listeners) {
                if (scope && listener.scope == scope) {
                    instance.unsubscribe(listener);
                }
                else {
                    instance.unsubscribe(listener);
                }
            }
        }
        static trigger(key, data) {
            let instance = Carbon.Reactive.get(key);
            if (instance !== undefined) {
                instance.trigger(data);
            }
        }
        static get(key) {
            let instance = Carbon.Reactive.instances.get(key);
            if (instance === undefined) {
                instance = new Carbon.Reactive(key);
                Carbon.Reactive.instances.set(key, instance);
            }
            return instance;
        }
        static remove(key) {
            Carbon.Reactive.instances.delete(name);
        }
        constructor(key) {
            this.listeners = [];
            this.key = key;
        }
        on(name, callback) {
            return this.subscribe(callback, {
                filter: e => e.type == name
            });
        }
        off(name) {
            for (var listener of Array.from(this.listeners)) {
                if (listener.filter && listener.filter({ type: name })) {
                    listener.dispose();
                }
            }
        }
        once(name, callback) {
            return this.subscribe(callback, {
                filter: e => e.type == name,
                once: true
            });
        }
        subscribe(callback, options) {
            let listener = new Carbon.Listener(callback, this, options);
            this.listeners.push(listener);
            return listener;
        }
        unsubscribe(listener) {
            let index = this.listeners.indexOf(listener);
            if (index > -1) {
                this.listeners.splice(index, 1);
                if (this.listeners.length == 0) {
                    this.dispose();
                    if (this.key) {
                        Carbon.Reactive.remove(this.key);
                    }
                }
            }
        }
        trigger(e, data) {
            if (typeof e == "string") {
                var d = { type: e };
                if (data) {
                    Object.assign(d, data);
                    data = null;
                }
                e = d;
            }
            for (var listener of Array.from(this.listeners)) {
                listener.fire(e, data);
            }
        }
        dispose() {
            while (this.listeners.length > 0) {
                this.listeners.pop();
            }
        }
    }
    Reactive.instances = new Map();
    Carbon.Reactive = Reactive;
    class Listener {
        constructor(callback, reactive, optionsOrFilter) {
            this.fireCount = 0;
            this.active = true;
            this.reactive = reactive;
            this.callback = callback;
            if (typeof optionsOrFilter === 'function') {
                this.filter = optionsOrFilter;
            }
            else if (optionsOrFilter) {
                let options = optionsOrFilter;
                this.scope = options.scope;
                this.filter = options.filter;
                this.once = options.once;
            }
        }
        fire(e, data) {
            if (!this.active)
                return;
            if (this.filter && !this.filter(e))
                return;
            this.callback(e, data || this);
            this.lastFired = new Date();
            this.fireCount++;
            if (this.once) {
                this.dispose();
            }
        }
        pause() {
            this.active = false;
        }
        resume() {
            this.active = true;
        }
        dispose() {
            this.active = false;
            this.reactive.unsubscribe(this);
        }
    }
    Carbon.Listener = Listener;
    Carbon.ActionKit = {
        listeners: new Map(),
        dispatch(e) {
            let match = _getActionElement(e.target, e.type);
            if (!match)
                return;
            let action = match.getAttribute('on-' + e.type);
            e.target = match;
            Carbon.ActionKit.execute(e, action);
        },
        observe(...args) {
            for (var name of args) {
                if (!Carbon.ActionKit.listeners.has(name)) {
                    document.body.addEventListener(name, Carbon.ActionKit.eventListener);
                    Carbon.ActionKit.listeners.set(name, Carbon.ActionKit.eventListener);
                }
            }
        },
        eventListener(e) {
            let target = _getActionElement(e.target, e.type);
            if (!target)
                return;
            let action = target.getAttribute('on-' + e.type);
            Carbon.ActionKit.execute({ target: target }, action);
        },
        execute(e, action) {
            for (var a of action.split(';')) {
                Carbon.ActionKit._execute(e, a);
            }
        },
        _execute(e, action) {
            var controllerName;
            var actionName;
            if (action.indexOf(':') > -1) {
                controllerName = action.split(':')[0];
                actionName = action.split(':')[1];
                if (controllerName.indexOf('#') > -1) {
                    var parts = controllerName.split('#');
                    controllerName = parts[0];
                    e.id = parts[1];
                }
            }
            if (!controllerName)
                return;
            let controller = Carbon.controllerFactory.get(controllerName);
            if (!controller)
                throw new Error(`Controller#${controllerName} not registered`);
            let func = controller[actionName];
            if (!func)
                throw new Error(`${controllerName} is missing '${actionName}'`);
            func.call(controller, e);
        }
    };
    class Template {
        static get(name) {
            let instance = Carbon.Template.instances.get(name);
            if (!instance) {
                instance = new Carbon.Template('#' + name.replace('#', ''));
                Carbon.Template.instances.set(name, instance);
            }
            return instance;
        }
        static parse(text) {
            let templateEl = document.createElement('template');
            templateEl.innerHTML = text;
            return new Template(templateEl.content);
        }
        constructor(value) {
            if (typeof value == 'string') {
                let element = document.querySelector(value);
                if (!element) {
                    console.log(`No template matching ${value} found.`);
                    return;
                }
                this.content = element.content || this.createFragmentForChildren(element);
            }
            else {
                this.content = value;
            }
        }
        createFragmentForChildren(element) {
            let frag = document.createDocumentFragment();
            let children = element.children;
            for (var i = 0; i < children.length; i++) {
                var child = children[i].cloneNode(true);
                frag.appendChild(child);
            }
            return frag;
        }
        render(data) {
            let nodes = this.clone().childNodes;
            for (var i = 0, len = nodes.length; i < len; i++) {
                var node = nodes[i];
                if (node.nodeType != 3) {
                    if (data) {
                        let result = this._replace(node.outerHTML, data);
                        return DOM.parse(result);
                    }
                    return node;
                }
            }
        }
        _replace(text, data) {
            for (var item in data) {
                text = text.replace(new RegExp('{{' + item + '}}', 'g'), data[item]);
            }
            return text;
        }
        clone() {
            return this.content.cloneNode(true);
        }
    }
    Template.instances = new Map();
    Carbon.Template = Template;
    function _getActionElement(el, type) {
        if (el.getAttribute('on-' + type))
            return el;
        for (var i = 0; i < 5; i++) {
            el = el.parentElement;
            if (!el)
                return null;
            if (el.getAttribute('on-' + type))
                return el;
        }
        return null;
    }
    ;
    let DOM;
    (function (DOM) {
        function parse(text) {
            let parser = new DOMParser();
            let dom = parser.parseFromString(text.trim(), 'text/html');
            return dom.body.childNodes[0];
        }
        DOM.parse = parse;
        function detach(node) {
            let parent = node.parentNode;
            if (!parent)
                return;
            parent.removeChild(node);
            return node;
        }
        DOM.detach = detach;
        function beforeRemoval(element) {
            for (var el of Array.from(element.querySelectorAll('[on-unload]'))) {
                Carbon.ActionKit.dispatch({
                    type: 'unload',
                    target: el
                });
                el.removeAttribute('on-unload');
            }
        }
        DOM.beforeRemoval = beforeRemoval;
        function onChange() {
            for (let el of Array.from(document.querySelectorAll('[on-insert]'))) {
                Carbon.ActionKit.dispatch({
                    type: 'insert',
                    target: el
                });
                el.removeAttribute('on-insert');
            }
        }
        DOM.onChange = onChange;
    })(DOM = Carbon.DOM || (Carbon.DOM = {}));
})(Carbon || (Carbon = {}));
var _;
(function (_) {
    function serialize(obj) {
        return Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');
    }
    _.serialize = serialize;
    function query(selector) {
        return document.querySelector(selector);
    }
    _.query = query;
    function queryAll(selector) {
        return Array.from(document.querySelectorAll(selector));
    }
    _.queryAll = queryAll;
    function trigger(el, name, detail) {
        return el.dispatchEvent(new CustomEvent(name, {
            bubbles: true,
            detail: detail
        }));
    }
    _.trigger = trigger;
    function one(element, type, listener) {
        let observer;
        let func = function (e) {
            listener(e);
            observer.stop();
            observer = null;
        };
        observer = new EventHandler(element, type, func, false);
    }
    _.one = one;
    function observe(element, type, handler) {
        return new EventHandler(element, type, handler, false);
    }
    _.observe = observe;
    class EventHandler {
        constructor(element, type, handler, options) {
            this.element = element;
            this.type = type;
            this.handler = handler;
            this.options = options;
            this.element.addEventListener(type, handler, options);
        }
        start() {
            this.element.addEventListener(this.type, this.handler, this.options);
        }
        stop() {
            this.element.removeEventListener(this.type, this.handler, this.options);
        }
        dispose() {
            this.stop();
            this.element = null;
            this.type = null;
            this.handler = null;
            this.options = null;
        }
    }
    _.EventHandler = EventHandler;
    _.defaultHeaders = {};
    function putJSON(url, data) {
        return sendJSON(url, 'PUT', data);
    }
    _.putJSON = putJSON;
    ;
    function patchJSON(url, data) {
        return sendJSON(url, 'PATCH', data);
    }
    _.patchJSON = patchJSON;
    ;
    function postJSON(url, data) {
        return sendJSON(url, 'POST', data);
    }
    _.postJSON = postJSON;
    ;
    async function getHTML(url) {
        let response = await send(url, {
            method: 'GET',
            headers: { 'Accept': 'text/html' }
        });
        return await response.text();
    }
    _.getHTML = getHTML;
    ;
    async function getJSON(url) {
        let response = await send(url, { method: 'GET' });
        let result = await response.json();
        if (!response.ok) {
            return Promise.reject(result);
        }
        return result;
    }
    _.getJSON = getJSON;
    ;
    async function sendJSON(url, method, data) {
        let response = await send(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        let result = await response.json();
        if (!response.ok) {
            return Promise.reject(data);
        }
        return result;
    }
    _.sendJSON = sendJSON;
    ;
    function post(url, options) {
        if (!options)
            options = {};
        options.method = 'POST';
        return send(url, options);
    }
    _.post = post;
    function send(url, options) {
        if (!options.headers)
            options.headers = {};
        for (var key of Object.keys(_.defaultHeaders)) {
            if (!options.headers[key]) {
                options.headers[key] = _.defaultHeaders[key];
            }
        }
        if (!options.headers['Accept']) {
            options.headers['Accept'] = 'application/json';
        }
        return fetch(url, options);
    }
    _.send = send;
    ;
})(_ || (_ = {}));
