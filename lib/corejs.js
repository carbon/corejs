"use strict";
var Carbon;
(function (Carbon) {
    Carbon.controllers = {
        get: function (name) {
            return Carbon.controllers[name];
        },
        set: function (name, controller) {
            Carbon.controllers[name] = controller;
        }
    };
    Carbon.controllerFactory = Carbon.controllers;
    var Reactive = (function () {
        function Reactive(key) {
            this.listeners = [];
            this.key = key;
        }
        Reactive.once = function (name, callback) {
            var sub = Carbon.Reactive.on(name, callback);
            sub.once = true;
            return sub;
        };
        Reactive.on = function (name, callback) {
            var parts = name.split('.');
            var scope = undefined;
            if (parts.length == 2)
                scope = parts[1];
            var instance = Carbon.Reactive.get(parts[0]);
            return instance.subscribe(callback, { scope: scope });
        };
        Reactive.off = function (name) {
            var parts = name.split('.');
            var scope = (parts.length == 2) ? parts[1] : undefined;
            var instance = Carbon.Reactive.get(parts[0]);
            for (var _i = 0, _a = instance.listeners; _i < _a.length; _i++) {
                var listener = _a[_i];
                if (scope && listener.scope == scope) {
                    instance.unsubscribe(listener);
                }
                else {
                    instance.unsubscribe(listener);
                }
            }
        };
        Reactive.trigger = function (key, data) {
            var instance = Carbon.Reactive.get(key);
            if (instance !== undefined) {
                instance.trigger(data);
            }
        };
        Reactive.get = function (key) {
            var instance = Carbon.Reactive.instances.get(key);
            if (instance === undefined) {
                instance = new Carbon.Reactive(key);
                Carbon.Reactive.instances.set(key, instance);
            }
            return instance;
        };
        Reactive.remove = function (key) {
            Carbon.Reactive.instances.delete(name);
        };
        Reactive.prototype.on = function (name, callback) {
            return this.subscribe(callback, {
                filter: function (e) { return e.type == name; }
            });
        };
        Reactive.prototype.off = function (name) {
            for (var _i = 0, _a = Array.from(this.listeners); _i < _a.length; _i++) {
                var listener = _a[_i];
                if (listener.filter && listener.filter({ type: name })) {
                    listener.dispose();
                }
            }
        };
        Reactive.prototype.once = function (name, callback) {
            return this.subscribe(callback, {
                filter: function (e) { return e.type == name; },
                once: true
            });
        };
        Reactive.prototype.subscribe = function (callback, options) {
            var listener = new Carbon.Listener(callback, this, options);
            this.listeners.push(listener);
            return listener;
        };
        Reactive.prototype.unsubscribe = function (listener) {
            var index = this.listeners.indexOf(listener);
            if (index > -1) {
                this.listeners.splice(index, 1);
                if (this.listeners.length == 0) {
                    this.dispose();
                    if (this.key) {
                        Carbon.Reactive.remove(this.key);
                    }
                }
            }
        };
        Reactive.prototype.trigger = function (e, data) {
            if (typeof e == "string") {
                var d = { type: e };
                if (data) {
                    Object.assign(d, data);
                    data = null;
                }
                e = d;
            }
            for (var _i = 0, _a = Array.from(this.listeners); _i < _a.length; _i++) {
                var listener = _a[_i];
                listener.fire(e, data);
            }
        };
        Reactive.prototype.dispose = function () {
            while (this.listeners.length > 0) {
                this.listeners.pop();
            }
        };
        Reactive.instances = new Map();
        return Reactive;
    }());
    Carbon.Reactive = Reactive;
    var Listener = (function () {
        function Listener(callback, reactive, optionsOrFilter) {
            this.fireCount = 0;
            this.active = true;
            this.reactive = reactive;
            this.callback = callback;
            if (typeof optionsOrFilter === 'function') {
                this.filter = optionsOrFilter;
            }
            else if (optionsOrFilter) {
                var options = optionsOrFilter;
                this.scope = options.scope;
                this.filter = options.filter;
                this.once = options.once;
            }
        }
        Listener.prototype.fire = function (e, data) {
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
        };
        Listener.prototype.pause = function () {
            this.active = false;
        };
        Listener.prototype.resume = function () {
            this.active = true;
        };
        Listener.prototype.dispose = function () {
            this.active = false;
            this.reactive.unsubscribe(this);
        };
        return Listener;
    }());
    Carbon.Listener = Listener;
    Carbon.ActionKit = {
        listeners: new Map(),
        dispatch: function (e) {
            var match = _getActionElement(e.target, e.type);
            if (!match)
                return;
            var action = match.getAttribute('on-' + e.type);
            e.target = match;
            Carbon.ActionKit.execute(e, action);
        },
        observe: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            for (var _a = 0, args_1 = args; _a < args_1.length; _a++) {
                var name = args_1[_a];
                if (!Carbon.ActionKit.listeners.has(name)) {
                    document.body.addEventListener(name, Carbon.ActionKit.eventListener);
                    Carbon.ActionKit.listeners.set(name, Carbon.ActionKit.eventListener);
                }
            }
        },
        eventListener: function (e) {
            var target = _getActionElement(e.target, e.type);
            if (!target)
                return;
            var action = target.getAttribute('on-' + e.type);
            Carbon.ActionKit.execute({ target: target }, action);
        },
        execute: function (e, action) {
            for (var _i = 0, _a = action.split(';'); _i < _a.length; _i++) {
                var a = _a[_i];
                Carbon.ActionKit._execute(e, a);
            }
        },
        _execute: function (e, action) {
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
            var controller = Carbon.controllerFactory.get(controllerName);
            if (!controller)
                throw new Error("Controller#" + controllerName + " not registered");
            var func = controller[actionName];
            if (!func)
                throw new Error(controllerName + " is missing '" + actionName + "'");
            func.call(controller, e);
        }
    };
    var Template = (function () {
        function Template(value) {
            if (typeof value == 'string') {
                var element = document.querySelector(value);
                if (!element) {
                    console.log("No template matching " + value + " found.");
                    return;
                }
                this.content = element.content || this.createFragmentForChildren(element);
            }
            else {
                this.content = value;
            }
        }
        Template.get = function (name) {
            var instance = Carbon.Template.instances.get(name);
            if (!instance) {
                instance = new Carbon.Template('#' + name.replace('#', ''));
                Carbon.Template.instances.set(name, instance);
            }
            return instance;
        };
        Template.parse = function (text) {
            var templateEl = document.createElement('template');
            templateEl.innerHTML = text;
            return new Template(templateEl.content);
        };
        Template.prototype.createFragmentForChildren = function (element) {
            var frag = document.createDocumentFragment();
            var children = element.children;
            for (var i = 0; i < children.length; i++) {
                var child = children[i].cloneNode(true);
                frag.appendChild(child);
            }
            return frag;
        };
        Template.prototype.render = function (data) {
            var nodes = this.clone().childNodes;
            for (var i = 0, len = nodes.length; i < len; i++) {
                var node = nodes[i];
                if (node.nodeType != 3) {
                    if (data) {
                        var result = this._replace(node.outerHTML, data);
                        return DOM.parse(result);
                    }
                    return node;
                }
            }
        };
        Template.prototype._replace = function (text, data) {
            for (var item in data) {
                text = text.replace(new RegExp('{{' + item + '}}', 'g'), data[item]);
            }
            return text;
        };
        Template.prototype.clone = function () {
            return this.content.cloneNode(true);
        };
        Template.instances = new Map();
        return Template;
    }());
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
        function parse(text) {
            var parser = new DOMParser();
            var dom = parser.parseFromString(text.trim(), 'text/html');
            return dom.body.childNodes[0];
        }
        DOM.parse = parse;
        function detach(node) {
            var parent = node.parentNode;
            if (!parent)
                return;
            parent.removeChild(node);
            return node;
        }
        DOM.detach = detach;
        function beforeRemoval(element) {
            for (var _i = 0, _a = Array.from(element.querySelectorAll('[on-unload]')); _i < _a.length; _i++) {
                var el = _a[_i];
                Carbon.ActionKit.dispatch({
                    type: 'unload',
                    target: el
                });
                el.removeAttribute('on-unload');
            }
        }
        DOM.beforeRemoval = beforeRemoval;
        function onChange() {
            for (var _i = 0, _a = Array.from(document.querySelectorAll('[on-insert]')); _i < _a.length; _i++) {
                var el = _a[_i];
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
        return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]); }).join('&');
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
    function addClass(el) {
        var names = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            names[_i - 1] = arguments[_i];
        }
        for (var _a = 0, names_1 = names; _a < names_1.length; _a++) {
            var name = names_1[_a];
            el.classList.add(name);
        }
    }
    _.addClass = addClass;
    function removeClass(el) {
        var names = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            names[_i - 1] = arguments[_i];
        }
        for (var _a = 0, names_2 = names; _a < names_2.length; _a++) {
            var name = names_2[_a];
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
        var observer;
        var func = function (e) {
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
    var EventHandler = (function () {
        function EventHandler(element, type, handler, options) {
            this.element = element;
            this.type = type;
            this.handler = handler;
            this.options = options;
            this.element.addEventListener(type, handler, options);
        }
        EventHandler.prototype.start = function () {
            this.element.addEventListener(this.type, this.handler, this.options);
        };
        EventHandler.prototype.stop = function () {
            this.element.removeEventListener(this.type, this.handler, this.options);
        };
        return EventHandler;
    }());
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
        }).then(function (response) { return response.text(); });
    }
    _.getHTML = getHTML;
    ;
    function getJSON(url) {
        return send(url, { method: 'GET' }).then(function (response) {
            if (!response.ok) {
                return response.json().then(function (data) { return Promise.reject(data); });
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
        }).then(function (response) {
            if (!response.ok) {
                return response.json().then(function (data) { return Promise.reject(data); });
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
        for (var _i = 0, _a = Object.keys(_.defaultHeaders); _i < _a.length; _i++) {
            var key = _a[_i];
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
