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
        constructor(key) {
            this.listeners = [];
            this.mode = null;
            this.queue = [];
            this.key = key;
        }
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
        on(name, callback) {
            return this.subscribe(callback, e => e.type == name);
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
                    if (this.key)
                        Carbon.Reactive.remove(this.key);
                }
            }
        }
        drain() {
            this.mode = null;
            while (this.queue.length > 0) {
                let e = this.queue.pop();
                this.trigger(e.name, e.data);
            }
            this.queue = null;
        }
        trigger(e, data) {
            if (this.mode == 'queue') {
                this.queue.push({ name: e, data: data });
                return;
            }
            for (var i = 0, len = this.listeners.length; i < len; i++) {
                this.listeners[i].fire(e, data);
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
            var controllerName, actionName;
            if (action.indexOf(':') > -1) {
                controllerName = action.split(':')[0];
                actionName = action.split(':')[1];
                if (controllerName.indexOf('#') > -1) {
                    e.id = controllerName.split('#')[1];
                    controllerName = controllerName.split('#')[0];
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
        constructor(selector) {
            this.element = document.querySelector(selector);
            if (!this.element) {
                console.log(`No template matching ${selector} found.`);
                return;
            }
            this.content = this.element.content || this.createFragmentForChildren();
        }
        static get(name) {
            let instance = Carbon.Template.instances.get(name);
            if (!instance) {
                instance = new Carbon.Template('#' + name.replace('#', ''));
                Carbon.Template.instances.set(name, instance);
            }
            return instance;
        }
        createFragmentForChildren() {
            let frag = document.createDocumentFragment();
            let children = this.element.children;
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
    var DOM;
    (function (DOM) {
        function parse(html) {
            let el = document.createElement('div');
            el.innerHTML = html;
            return el.firstChild;
        }
        DOM.parse = parse;
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
    function addClass(el, ...names) {
        for (var name of names) {
            el.classList.add(name);
        }
    }
    _.addClass = addClass;
    function removeClass(el, ...names) {
        for (var name of names) {
            el.classList.remove(name);
        }
    }
    _.removeClass = removeClass;
    function toggleClass(el, name, force) {
        if (force === true) {
            el.classList.add(name);
        }
        else if (force === false) {
            el.classList.remove(name);
        }
        else {
            el.classList.toggle(name);
        }
    }
    _.toggleClass = toggleClass;
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
    function getHTML(url) {
        return send(url, {
            method: 'GET',
            headers: { 'Accept': 'text/html' }
        }).then(response => response.text());
    }
    _.getHTML = getHTML;
    ;
    function getJSON(url) {
        return send(url, { method: 'GET' }).then(response => {
            if (!response.ok) {
                return response.json().then(data => Promise.reject(data));
            }
            return response.json();
        });
    }
    _.getJSON = getJSON;
    ;
    function sendJSON(url, method, data) {
        return send(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(response => {
            if (!response.ok) {
                return response.json().then(data => Promise.reject(data));
            }
            return response.json();
        });
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
        options.credentials = 'same-origin';
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
