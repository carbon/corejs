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

  export class Deferred<T> {
    promise: Promise<T>;
    resolve: Function;
    reject: Function;
    then: any;
    catch: any;
    finally: any;

    constructor() {
      this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
  
      this.then = this.promise.then.bind(this.promise);
      this.catch = this.promise.catch.bind(this.promise);
      this.finally = this.promise.finally.bind(this.promise);
    }
  }

  export class Reactive {
    static instances = new Map<string, Reactive>();

    static once(name: string, callback: Function) {
      let sub = Carbon.Reactive.on(name, callback);

      sub.once = true;

      return sub;
    }

    static on(name: string, callback: Function) {
      let parts = name.split('.');
      let scope = undefined;

      if (parts.length == 2) scope = parts[1];

      let instance = Carbon.Reactive.get(parts[0]);

      return instance.subscribe(callback, { scope: scope });
    }

    static off(name: string) {
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

    static trigger(key: string, data: any) {
      let instance = Carbon.Reactive.get(key);

      if (instance !== undefined) {
        instance.trigger(data);
      }
    }

    static get(key: string) : Reactive {
      let instance = Carbon.Reactive.instances.get(key);

      if (instance === undefined) {
        instance = new Carbon.Reactive(key);

        Carbon.Reactive.instances.set(key, instance)
      }

      return instance;
    }

    static remove(key: string) {
      Carbon.Reactive.instances.delete(key)
    }

    key: string;
    listeners: Array<Listener> = [];
    
    constructor(key?: string) {
      this.key = key;
    }

    on(name: string, callback: Function) : Listener {
      return this.subscribe(callback, { 
        filter: e => e.type == name
      });
    }

    off(name: string) {
      for (var listener of Array.from(this.listeners)) {
        if (listener.filter && listener.filter({ type: name })) {
          listener.dispose();
        }
      }
    }

    once(name: string, callback) {
      return this.subscribe(callback, {
        filter : e => e.type == name,
        once   : true
      });
    }

    subscribe(callback, options?: ListenerOptions) {
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

    trigger(e, data?: any) {
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

    constructor(callback: Function, reactive: Reactive, optionsOrFilter: ListenerOptions | ((e) => boolean)) {
      this.reactive = reactive;
      this.callback = callback;

      if (typeof optionsOrFilter === 'function') {
        this.filter = <(e:any) => boolean>optionsOrFilter;
      }
      else if (optionsOrFilter) {
        let options: ListenerOptions = optionsOrFilter;

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
      this.active = false;

      this.reactive.unsubscribe(this);
    }
  }
  
  // A lightweight event listener / dispatcher
  export var ActionKit = {
    listeners: new Map<string, Function>(),

    dispatch(e: any) {
      let match = _getActionElement(e.target, e.type);

      if (!match) return;

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

      if (!target) return;

      let action = target.getAttribute('on-' + e.type);

      Carbon.ActionKit.execute({ target: target }, action);
    },

    execute(e, action: string) {
      for (var a of action.split(';')) {
        Carbon.ActionKit._execute(e, a);
      }
    },

    _execute(e, action: string) {
      var controllerName: string;
      var actionName: string;

      if (action.indexOf(':') > -1) {
        controllerName = action.split(':')[0];
        actionName = action.split(':')[1];

        // TODO: Parse args (arg, arg, arg)
        if (controllerName.indexOf('#') > -1) {
          var parts = controllerName.split('#');

          controllerName = parts[0];

          e.id = parts[1];
        }
      }

      if (!controllerName) return;

      let controller = Carbon.controllerFactory.get(controllerName);

      if (!controller) throw new Error(`Controller#${controllerName} not registered`);
      
      let func = <Function>controller[actionName];
      
      if (!func) throw new Error(`${controllerName} is missing '${actionName}'`);
      
      func.call(controller, e);
    }
  };

  export class Template {
    static instances = new Map<string, Template>();

    static get(name: string) : Template {
      let instance = Carbon.Template.instances.get(name);

      if (!instance) {
        instance = new Carbon.Template('#' + name.replace('#', ''));

        Carbon.Template.instances.set(name, instance)
      }

      return instance;
    }

    static parse(text: string) : Template {
      let templateEl = document.createElement('template');
      
      templateEl.innerHTML = text;
      
      return new Template(templateEl.content);
    }

    content: DocumentFragment;

    constructor(value: String | DocumentFragment) {
      // #templateId

      if (typeof value == 'string') {
        let element = document.querySelector(value) as HTMLTemplateElement; // NATIVE element

        if (!element) {
          console.log(`No template matching ${value} found.`);

          return;
        }

        // Document Fragment
        this.content = element.content || this.createFragmentForChildren(element);
      }
      else  {
        this.content = value as DocumentFragment;
      }
    }

    createFragmentForChildren(element: HTMLElement): DocumentFragment {
      let frag = document.createDocumentFragment();

      let children = element.children;

      for (var i = 0; i < children.length; i++) {
        var child = children[i].cloneNode(true);

        frag.appendChild(child);
      }

      return frag;
    }

    render(data: any): HTMLElement {
      let nodes = this.clone().childNodes;

      for (var i = 0, len = nodes.length; i < len; i++) {
        var node = nodes[i] as HTMLElement;

        // First non-text node
        if (node.nodeType != 3) {
          if (data) {
            let result = this._replace(node.outerHTML, data);

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
    export function parse(text: string) : HTMLElement {
      let parser = new DOMParser();

      let dom = parser.parseFromString(text.trim(), 'text/html');

      return dom.body.childNodes[0] as HTMLElement;
    }

    export function detach(node: Node) {
      let parent = node.parentNode;
  
      if (!parent) return;
      
      parent.removeChild(node);
  
      return node;
    }

    export function beforeRemoval(element: HTMLElement) {
      for (var el of Array.from(element.querySelectorAll('[on-unload]'))) {
        Carbon.ActionKit.dispatch({
          type   : 'unload',
          target : el
        });
          
        el.removeAttribute('on-unload');
      }
    }

    export function onChange() {
      for (let el of Array.from(document.querySelectorAll('[on-insert]'))) {
          Carbon.ActionKit.dispatch({
            type   : 'insert',
            target : el
         });
      
        el.removeAttribute('on-insert');
      }
    }
  }
}

module _ {
  export function serialize(obj: any): string {
    return Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');
  }

  export function query(selector: string) : Element {
    return document.querySelector(selector);
  }

  export function queryAll(selector: string) : Element[] {
    return Array.from(document.querySelectorAll(selector));
  }

  export function trigger(el: Element | Window, name: string, detail?: any): boolean {
    return el.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail: detail
    }));
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

    dispose() {
      this.stop();

      this.element = null;
      this.type = null;
      this.handler = null;
      this.options = null;     
    }
  }

  export var defaultHeaders = <any>{ }; 

  /* fetch helpers */
  export function putJSON(url: string, data: any): Promise<any> {
    return sendJSON(url, 'PUT', data);
  };

  export function patchJSON(url: string, data: any): Promise<any> {
    return sendJSON(url, 'PATCH', data);
  };

  export function postJSON(url: string, data: any): Promise<any> {
    return sendJSON(url, 'POST', data);
  };

  export async function getHTML(url: string): Promise<string> {
    let response = await send(url, {
      method: 'GET',
      headers: { 'Accept': 'text/html' }
    });
    
    return await response.text();
  };

  export async function getJSON(url: string): Promise<any> {
    let response = await send(url, { method: 'GET' });

    let result = await response.json();

    if (!response.ok) {
      return Promise.reject(result);
    }

    return result;
  };

  export async function sendJSON(url: string, method: string, data: any): Promise<any> {
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
  };

  export function post(url: string, options?: RequestInit): Promise<Response> {
    if (!options) options = { };

    options.method = 'POST';

    return send(url, options);
  }

  export function send(url: string, options: RequestInit): Promise<Response> {
    if (!options.headers) options.headers = { };
    
    for (var key of Object.keys(defaultHeaders)) {
      if (!options.headers[key]) {
        options.headers[key] = defaultHeaders[key];
      }
    }

    if (!options.headers['Accept']) {
      options.headers['Accept'] = 'application/json';
    }

    return fetch(url, options);
  };
}