module Carbon {
  export var controllers = {
    get(name: string) {
      return controllers[name];
    },

    set(name: string, controller: any) {
      controllers[name] = controller;
    }
  };

  export var controllerFactory = controllers;

  export class Reactive {
    static instances = new Map<string, Reactive>();

    static once(name, callback) {
      var sub = Carbon.Reactive.on(name, callback);

      sub.once = true;

      return sub;
    }

    static on(name: string, callback: Function) {
      var parts = name.split('.');
      var scope = undefined;

      if (parts.length == 2) scope = parts[1];

      var instance = Carbon.Reactive.get(parts[0]);

      return instance.subscribe(callback, { scope: scope });
    }

    static off(name: string) {
      var parts = name.split('.');
      var scope = undefined;

      if (parts.length == 2) scope = parts[1];

      var instance = Carbon.Reactive.get(parts[0]);

      for (var listener of instance.listeners) {
        if (scope && listener.scope == scope) {
          instance.unsubscribe(listener);
        }
        else {
          instance.unsubscribe(listener);
        }
      }
    }

    static trigger(key: string, data) {
      var instance = Carbon.Reactive.get(key);

      if (instance !== undefined) {
        instance.trigger(data);
      }
    }

    static get(key) : Reactive {
      var instance = Carbon.Reactive.instances.get(key);

      if (instance === undefined) {
        instance = new Carbon.Reactive(key);

        Carbon.Reactive.instances.set(key, instance)
      }

      return instance;
    }

    static remove(key: string) {
      Carbon.Reactive.instances.delete(name)
    }


    key: string;
    listeners: Array<Listener> = [];
    
    mode = null;
    queue = [ ];

    constructor(key?: string) {
      this.key = key;
    }

    on(name: string, callback: Function) : Listener {
      return this.subscribe(callback, e => e.type == name);
    }

    once(name: string, callback) {
      return this.subscribe(callback, {
        filter : e => e.type == name,
        once   : true
      });
    }

    subscribe(callback, options?: ListenerOptions) {
      var listener = new Carbon.Listener(callback, this, options);

      this.listeners.push(listener);

      return listener;
    }

    unsubscribe(listener) {
      var index = this.listeners.indexOf(listener);

      if (index > -1) {
        this.listeners.splice(index, 1);

        if (this.listeners.length == 0) {
          this.dispose();

          if (this.key) Carbon.Reactive.remove(this.key);
        }
      }
    }

    drain() {
      this.mode = null;
      
      while (this.queue.length > 0) {
        var e = this.queue.pop();
        
        this.trigger(e.name, e.data);
      }
      
      this.queue = null;
    }
    
    trigger(e, data?) {
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

  interface ListenerOptions {
    scope?  : string;
    once?   : boolean;
    filter? : (e) => boolean;
  }

  export class Listener {
    callback: Function;
    reactive: Reactive;
    fireCount = 0;

    once: boolean;
    lastFired: Date;
    filter: (e) => boolean;
    scope: any;

    active = true;

    constructor(callback: Function, reactive: Reactive, optionsOrFilter: ListenerOptions|((e) => boolean)) {
      this.reactive = reactive;
      this.callback = callback;

      if (typeof optionsOrFilter === 'function') {
        this.filter = <(e) => boolean>optionsOrFilter;
      }
      else if (optionsOrFilter) {
        var options = <ListenerOptions>optionsOrFilter;

  	    this.scope  = options.scope;
  	    this.filter = options.filter;
  	    this.once = options.once;
  	  }
    }

    fire(e, data?) {
      if (!this.active) return;

      if (this.filter && !this.filter(e)) return;

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
  
  // A lightweight event listener / dispatcher
  export var ActionKit = {
    listeners: new Map<string, Function>(),

    dispatch(e) {
      let match = _getActionElement(e.target, e.type);

      if (!match) return;

      let action = match.getAttribute('on-' + e.type);

      e.target = match;

      Carbon.ActionKit.execute(e, action);
    },

    observe(...args: string[]) {
      for (var name of args) {
        if (!Carbon.ActionKit.listeners.has(name)) {
          document.body.addEventListener(name, Carbon.ActionKit.eventListener);

          Carbon.ActionKit.listeners.set(name, Carbon.ActionKit.eventListener);
        }
      }
    },

    eventListener(e) {
      var target = _getActionElement(e.target, e.type);

      if (!target) return;

      var action = target.getAttribute('on-' + e.type);

      Carbon.ActionKit.execute({ target: target }, action);
    },

    execute(e, action: string) {
      for (var a of action.split(';')) {
        Carbon.ActionKit._execute(e, a);
      }
    },

    _execute(e, action: string) {
      var controllerName, actionName;

      if (action.indexOf(':') > -1) {
        controllerName = action.split(':')[0];
        actionName = action.split(':')[1];

        // TODO: Parse args (arg, arg, arg)
        if (controllerName.indexOf('#') > -1) {
          e.id = controllerName.split('#')[1];

          controllerName = controllerName.split('#')[0];
        }
      }

      if (!controllerName) return;

      var controller = Carbon.controllerFactory.get(controllerName);

      if (!controller) throw new Error(`Controller#${controllerName} not registered`);
      
      var func = <Function>controller[actionName];
      
      if (!func) throw new Error(`${controllerName} is missing '${actionName}'`);
      
      func.call(controller, e);
    }
  };

  export class Template {
    static instances = new Map<string, Template>();

    static get(name: string) : Template {
      var instance = Carbon.Template.instances.get(name);

      if (!instance) {
        instance = new Carbon.Template('#' + name.replace('#', ''));

        Carbon.Template.instances.set(name, instance)
      }

      return instance;
    }

    element: any;
    content: any;

    constructor(selector) {
      // #templateId
      this.element = document.querySelector(selector); // NATIVE element

      if(!this.element) {
        console.log(`No template matching ${selector} found.`);

        return;
      }

      // Document Fragment
      this.content = this.element.content || this.createFragmentForChildren();
    }

    createFragmentForChildren(): DocumentFragment {
      var frag = document.createDocumentFragment();

      var children = this.element.children;

      for (var i = 0; i < children.length; i++) {
        var child = children[i].cloneNode(true);

        frag.appendChild(child);
      }

      return frag;
    }

    render(data): HTMLElement {
      var nodes = this.clone().childNodes;

      for (var i = 0, len = nodes.length; i < len; i++) {
        var node = nodes[i];

        // First non-text node
        if (node.nodeType != 3) {
          if (data) {
            var result = this._replace(node.outerHTML, data);

            return DOM.parse(result);
          }

          return node;
        }
      }
    }

    _replace(text: string, data: any) {
      for (var item in data) {
        text = text.replace(new RegExp('{{' + item + '}}', 'g'), data[item]);
      }

      return text;
    }

    clone() {
      return this.content.cloneNode(/*deepClone*/ true);
    }
  }

  function _getActionElement(el, type) {
    if (el.getAttribute('on-' + type)) return el;

    for (var i = 0; i < 5; i++) { // Look upto 5 level up
      el = el.parentElement;

      if (!el) return null;

      if (el.getAttribute('on-' + type)) return el;
    }

    return null;
  };
  
  export module DOM {
    // TODO: Support fragments
  
    export function parse(html: string) : HTMLElement {
      var el = document.createElement('div');
      
      el.innerHTML = html;
      
      return <HTMLElement>el.firstChild;
    }
  }
}

module _ {
  export function serialize(obj): string {
    return Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');
  }

  export function query(selector: string) : Element {
    return document.querySelector(selector);
  }

  export function queryAll(selector: string) : Element[] {
    return Array.from(document.querySelectorAll(selector));
  }

  export function trigger(el: Element | Window, name: string, detail?): boolean {
    return el.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail: detail
    }));
  }

  export function addClass(el: Element, ...names: string[]) {
    for (var name of names) {
      el.classList.add(name);
    }
  }

  export function removeClass(el: Element, ...names: string[]) {
    for (var name of names) {
      el.classList.remove(name);
    }
  }

  export function toggleClass(el: Element, name: string, force?: boolean) {
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

  export function one(element: Element, type: string, listener: EventListener) {
    let observer: EventHandler;

    let func = function(e: Event) {
      listener(e);

      observer.stop();

      observer = null;
    }

    observer = new EventHandler(element, type, func, false);
  }

  export function observe(element: Element, type: string, handler: EventListener) : EventHandler {
    return new EventHandler(element, type, handler, false);
  }

  export class EventHandler {
    constructor(public element: Element | Window, public type, public handler, public options) {
      this.element.addEventListener(type, handler, options);
    }

    start() {
      this.element.addEventListener(this.type, this.handler, this.options);
    }

    stop() {
      this.element.removeEventListener(this.type, this.handler, this.options)
    }
  }
}
