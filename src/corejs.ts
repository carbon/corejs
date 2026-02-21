module Carbon {
  const _controllerRegistry = new Map<string, any>();

  export var controllers = {
    get(name: string) {
      return _controllerRegistry.get(name);
    },
    set(name: string, controller: any) {
      _controllerRegistry.set(name, controller);
    }
  };

  export var controllerFactory = controllers;

  export class Deferred<T> {
    promise: Promise<T>;
    resolve!: (value: T | PromiseLike<T>) => void;
    reject!: (reason?: any) => void;
    then: Promise<T>['then'];
    catch: Promise<T>['catch'];
    finally: Promise<T>['finally'];

    constructor() {
      this.promise = new Promise<T>((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });

      this.then    = this.promise.then.bind(this.promise);
      this.catch   = this.promise.catch.bind(this.promise);
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
      let parts  = name.split('.');
      let scope  = parts.length === 2 ? parts[1] : undefined;
      let instance = Carbon.Reactive.get(parts[0]);
      return instance.subscribe(callback, { scope });
    }

    static off(name: string) {
      let parts    = name.split('.');
      let scope    = parts.length === 2 ? parts[1] : undefined;
      let instance = Carbon.Reactive.get(parts[0]);

      for (let listener of Array.from(instance.listeners)) {
        if (!scope || listener.scope === scope) {
          instance.unsubscribe(listener);
        }
      }
    }

    static trigger(key: string, data: any) {
      let instance = Carbon.Reactive.instances.get(key);
      if (instance !== undefined) {
        instance.trigger(data);
      }
    }

    static get(key: string): Reactive {
      let instance = Carbon.Reactive.instances.get(key);
      if (instance === undefined) {
        instance = new Carbon.Reactive(key);
        Carbon.Reactive.instances.set(key, instance);
      }
      return instance;
    }

    static remove(key: string) {
      Carbon.Reactive.instances.delete(key);
    }

    key: string;
    listeners: Array<Listener> = [];

    constructor(key?: string) {
      this.key = key;
    }

    on(name: string, callback: Function): Listener {
      return this.subscribe(callback, {
        filter: e => e.type === name
      });
    }

    off(name: string) {
      for (let listener of Array.from(this.listeners)) {
        if (listener.filter && listener.filter({ type: name })) {
          listener.dispose();
        }
      }
    }

    once(name: string, callback: Function) {
      return this.subscribe(callback, {
        filter : e => e.type === name,
        once   : true
      });
    }

    subscribe(callback: Function, options?: ListenerOptions): Listener {
      let listener = new Carbon.Listener(callback, this, options);
      this.listeners.push(listener);
      return listener;
    }

    unsubscribe(listener: Listener) {
      let index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);

        if (this.listeners.length === 0) {
          if (this.key) {
            Carbon.Reactive.remove(this.key);
          }
        }
      }
    }

    trigger(e: string | Record<string, any>, data?: any) {
      if (typeof e === 'string') {
        e = data ? Object.assign({ type: e }, data) : { type: e };
        data = undefined;
      }
      for (let listener of Array.from(this.listeners)) {
        listener.fire(e, data);
      }
    }

    dispose() {
      this.listeners = [];
    }
  }

  interface ListenerOptions {
    scope?  : string;
    once?   : boolean;
    filter? : (e: any) => boolean;
  }

  export class Listener {
    callback: Function;
    reactive: Reactive;
    fireCount = 0;

    once: boolean;
    lastFired: Date;
    filter: (e: any) => boolean;
    scope: any;

    private _disposed = false;
    active = true;

    constructor(callback: Function, reactive: Reactive, optionsOrFilter?: ListenerOptions | ((e: any) => boolean)) {
      this.reactive = reactive;
      this.callback = callback;

      if (typeof optionsOrFilter === 'function') {
        this.filter = optionsOrFilter;
      } else if (optionsOrFilter) {
        this.scope  = optionsOrFilter.scope;
        this.filter = optionsOrFilter.filter;
        this.once   = optionsOrFilter.once;
      }
    }

    fire(e: any, data?: any) {
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
      if (this._disposed) return; // Fix #8: guard
      this._disposed = true;
      this.active = false;
      this.reactive.unsubscribe(this);
    }
  }

  export var ActionKit = {
    listeners: new Map<string, EventListener>(),

    dispatch(e: { type: string; target: Element }) {
      let match = _getActionElement(e.target, e.type);
      if (!match) return;

      let action = match.getAttribute('on-' + e.type);
      e.target = match;
      Carbon.ActionKit.execute(e, action);
    },

    observe(...args: string[]) {
      for (let name of args) {
        if (!Carbon.ActionKit.listeners.has(name)) {
          document.body.addEventListener(name, Carbon.ActionKit.eventListener);
          Carbon.ActionKit.listeners.set(name, Carbon.ActionKit.eventListener);
        }
      }
    },

    eventListener(e: Event) {
      let target = _getActionElement(e.target as Element, e.type);
      if (!target) return;

      let action = target.getAttribute('on-' + e.type);
      Carbon.ActionKit.execute({ target }, action);
    },

    execute(e: any, action: string) {
      for (let a of action.split(';')) {
        Carbon.ActionKit._execute(e, a.trim());
      }
    },

    _execute(e: any, action: string) {
      if (!action || action.indexOf(':') === -1) return;

      let [rawController, actionName] = action.split(':');
      let controllerName = rawController;

      if (controllerName.indexOf('#') > -1) {
        let [name, id] = controllerName.split('#');
        controllerName = name;
        e.id = id;
      }

      let controller = Carbon.controllerFactory.get(controllerName);
      if (!controller) throw new Error(`Controller '${controllerName}' is not registered`);

      let func = controller[actionName] as Function;
      if (!func) throw new Error(`Controller '${controllerName}' has no action '${actionName}'`);

      func.call(controller, e);
    }
  };

  export class Template {
    static instances = new Map<string, Template>();

    static get(name: string): Template {
      let instance = Carbon.Template.instances.get(name);
      if (!instance) {
        instance = new Carbon.Template('#' + name.replace('#', ''));
        Carbon.Template.instances.set(name, instance);
      }
      return instance;
    }

    static parse(text: string): Template {
      let el = document.createElement('template');
      el.innerHTML = text;
      return new Template(el.content);
    }

    content: DocumentFragment;

    constructor(value: string | DocumentFragment) {
      if (typeof value === 'string') {
        let element = document.querySelector(value) as HTMLTemplateElement;
        if (!element) {
          console.warn(`No template matching '${value}' found.`);
          return;
        }
        this.content = element.content || this.createFragmentForChildren(element);
      } else {
        this.content = value;
      }
    }

    createFragmentForChildren(element: HTMLElement): DocumentFragment {
      let frag = document.createDocumentFragment();
      for (let i = 0; i < element.children.length; i++) {
        frag.appendChild(element.children[i].cloneNode(true));
      }
      return frag;
    }

    render(data?: any): HTMLElement | null {
      let nodes = this.clone().childNodes;
      for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i] as HTMLElement;
        if (node.nodeType !== Node.TEXT_NODE) {
          if (data) {
            return DOM.parse(this._replace(node.outerHTML, data));
          }
          return node;
        }
      }
      return null;
    }

    _replace(text: string, data: Record<string, any>): string {
      for (let key in data) {
        text = text.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
      }
      return text;
    }

    clone(): DocumentFragment {
      return this.content.cloneNode(true) as DocumentFragment;
    }
  }

  function _getActionElement(el: Element, type: string): Element | null {
    if (el && el.getAttribute('on-' + type)) return el;

    for (let i = 0; i < 5; i++) {
      el = el?.parentElement;
      if (!el) return null;
      if (el.getAttribute('on-' + type)) return el;
    }

    return null;
  }

  export module DOM {
    export function parse(text: string): HTMLElement {
      let parser = new DOMParser();
      let dom = parser.parseFromString(text.trim(), 'text/html');
      return dom.body.childNodes[0] as HTMLElement;
    }

    export function detach(node: Node): Node | undefined {
      let parent = node.parentNode;
      if (!parent) return;
      parent.removeChild(node);
      return node;
    }

    export function beforeRemoval(element: HTMLElement) {
      for (let el of Array.from(element.querySelectorAll('[on-unload]'))) {
        Carbon.ActionKit.dispatch({ type: 'unload', target: el as Element });
        el.removeAttribute('on-unload');
      }
    }

    export function onChange() {
      for (let el of Array.from(document.querySelectorAll('[on-insert]'))) {
        Carbon.ActionKit.dispatch({ type: 'insert', target: el as Element });
        el.removeAttribute('on-insert');
      }
    }
  }
}

module _ {
  export function serialize(obj: Record<string, any>): string {
    return Object.keys(obj)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`)
      .join('&');
  }

  export function trigger(el: Element | Window, name: string, detail?: any): boolean {
    return el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }

  export function one(element: Element, type: string, listener: EventListener) {
    let observer: EventHandler;
    let func = (e: Event) => {
      listener(e);
      observer?.stop();
      observer = null;
    };
    observer = new EventHandler(element, type, func, false);
  }

  export function observe(element: Element, type: string, handler: EventListener): EventHandler {
    return new EventHandler(element, type, handler, false);
  }

  export class EventHandler {
    constructor(
      public element: Element | Window,
      public type: string,
      public handler: EventListener,
      public options: boolean | AddEventListenerOptions
    ) {
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
      this.type    = null;
      this.handler = null;
      this.options = null;
    }
  }

  export var defaultHeaders: Record<string, string> = {};

  export function send(url: string, options: RequestInit): Promise<Response> {
    let headers: Record<string, string> = Object.assign({}, defaultHeaders, options.headers as Record<string, string>);

    if (!headers['Accept']) {
      headers['Accept'] = 'application/json';
    }

    options.headers = headers;
    return fetch(url, options);
  }

  export function post(url: string, options: RequestInit = {}): Promise<Response> {
    return send(url, { ...options, method: 'POST' });
  }

  export async function getHTML(url: string): Promise<string> {
    let response = await send(url, { method: 'GET', headers: { Accept: 'text/html' } });
    return response.text();
  }

  export async function getJSON<T = any>(url: string): Promise<T> {
    let response = await send(url, { method: 'GET' });
    let result   = await response.json();
    if (!response.ok) return Promise.reject(result);
    return result;
  }

  export function putJSON<T = any>(url: string, data: any): Promise<T> {
    return sendJSON(url, 'PUT', data);
  }

  export function patchJSON<T = any>(url: string, data: any): Promise<T> {
    return sendJSON(url, 'PATCH', data);
  }

  export function postJSON<T = any>(url: string, data: any): Promise<T> {
    return sendJSON(url, 'POST', data);
  }

  export async function sendJSON<T = any>(url: string, method: string, data: any): Promise<T> {
    let response = await send(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let result = await response.json();
    if (!response.ok) return Promise.reject(result);
    return result;
  }
}