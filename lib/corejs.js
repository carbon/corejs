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
            var scope = undefined;
            if (parts.length == 2)
                scope = parts[1];
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
            return this.subscribe(callback, function (e) { return e.type == name; });
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
                    if (this.key)
                        Carbon.Reactive.remove(this.key);
                }
            }
        };
        Reactive.prototype.trigger = function (e, data) {
            for (var i = 0, len = this.listeners.length; i < len; i++) {
                this.listeners[i].fire(e, data);
            }
        };
        Reactive.prototype.dispose = function () {
            while (this.listeners.length > 0) {
                this.listeners.pop();
            }
        };
        Reactive.instances = new Map();
        return Reactive;
    })();
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
            if (this.once)
                this.dispose();
        };
        Listener.prototype.pause = function () {
            this.active = false;
        };
        Listener.prototype.resume = function () {
            this.active = true;
        };
        Listener.prototype.dispose = function () {
            this.reactive.unsubscribe(this);
        };
        return Listener;
    })();
    Carbon.Listener = Listener;
    Carbon.ActionKit = {
        listeners: new Map(),
        dispatch: function (e) {
            var match = Carbon.ActionKit._getActionElement(e.target, e.type);
            if (!match)
                return;
            var action = match.getAttribute('on-' + e.type);
            e.target = match;
            Carbon.ActionKit.execute(e, action);
        },
        observe: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i - 0] = arguments[_i];
            }
            for (var _a = 0; _a < args.length; _a++) {
                var name = args[_a];
                if (!Carbon.ActionKit.listeners.has(name)) {
                    document.body.addEventListener(name, Carbon.ActionKit.eventListener);
                    Carbon.ActionKit.listeners.set(name, Carbon.ActionKit.eventListener);
                }
            }
        },
        eventListener: function (e) {
            var target = Carbon.ActionKit._getActionElement(e.target, e.type);
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
            var controllerName, actionName;
            if (action.includes(':')) {
                controllerName = action.split(':')[0];
                actionName = action.split(':')[1];
                if (controllerName.contains('#')) {
                    e.id = controllerName.split('#')[1];
                    controllerName = controllerName.split('#')[0];
                }
            }
            if (!controllerName)
                return;
            var controller = Carbon.controllerFactory.get(controllerName);
            if (!controller)
                throw new Error('No controller named:' + controllerName);
            controller[actionName](e);
        },
        _getActionElement: function (el, type) {
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
    };
    var Timer = (function () {
        function Timer(time, immediate) {
            this.time = time;
            this.defer = $.Deferred();
            this.defer.promise(this);
            if (immediate) {
                this.start();
            }
        }
        Timer.prototype.cancel = function () {
            clearTimeout(this.timeout);
        };
        Timer.prototype.start = function () {
            this.timeout = setTimeout(this.defer.resolve.bind(this), this.time);
        };
        return Timer;
    })();
    Carbon.Timer = Timer;
    var Template = (function () {
        function Template(selector) {
            this.element = document.querySelector(selector);
            if (!this.element) {
                console.log('No template matching ' + selector + ' found.');
                return;
            }
            this.content = this.element.content || this.createFragmentForChildren();
        }
        Template.get = function (name) {
            var instance = Carbon.Template.instances.get(name);
            if (instance === undefined) {
                instance = new Carbon.Template('#' + name);
                Carbon.Template.instances.set(name, instance);
            }
            return instance;
        };
        Template.prototype.createFragmentForChildren = function () {
            var frag = document.createDocumentFragment();
            var children = this.element.children;
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
                        var result = this.replace(node.outerHTML, data);
                        return $(result);
                    }
                    return $(node);
                }
            }
        };
        Template.prototype.replace = function (text, data) {
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
    })();
    Carbon.Template = Template;
})(Carbon || (Carbon = {}));
