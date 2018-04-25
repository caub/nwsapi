const nwsapiFactory = require('../src/nwsapi');

// minimal fake global object, for testing nwsapi

class Document {
  constructor(...children) {
    this.nodeName = '#document';
    this.documentElement = new Element({
      nodeName: 'HTML',
      children,
      ownerDocument: this
    });
    this.nodeType = 9;
    this.contentType = 'text/html';
    this.compatMode = 'BackCompat';
    this.firstChild = this.documentElement;
    this.firstElementChild = this.documentElement;
    this._elementById = new Map();
  }
  createElement(tag) {
    return new Element({ nodeName: String(tag).toUpperCase() });
  }
  getElementsByTagNameNS(ns, tag) {
    return this.firstElementChild.getElementsByTagNameNS(ns, tag);
  }
  getElementsByTagName(tag) {
    return this.firstElementChild.getElementsByTagName(tag);
  }
  getElementsByClassName(cn) {
    return this.firstElementChild.getElementsByClassName(cn);
  }
  getElementById(s) {
    return this._elementById.get(s);
  }
}

class Element {
  constructor({ nodeName = 'DIV', attrs = [], ownerDocument, children = [] }) {
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.nodeName = nodeName.toUpperCase();
    const names = nodeName.toLowerCase().split(':');
    this.localName = names[1] || names[0];
    this.prefix = names.length === 2 ? names[0] : undefined;
    this._attrs = new Map(attrs);
    this.parentNode = null;
    this.nextSibling = null;
    this.previousSibling = null;

    if (this._attrs.has('id')) {
      this.ownerDocument._elementsById.set(this._attrs.get('id'), this);
    }

    children.forEach((el, i) => {
      el.parentNode = this;
      el.ownerDocument = this.ownerDocument;

      if (children[i - 1]) {
        children[i - 1].nextSibling = el;
        el.previousSibling = children[i - 1];
      }
      if (children[i + 1]) {
        children[i + 1].previousSibling = el;
        el.nextSibling = children[i + 1];
      }
    })
    this.firstChild = children[0];

    // nwsapi doesn't use children, but only firstElementChild, nextElementSibling, previousElementSibling
  }

  get firstElementChild() {
    return this.firstChild && (this.firstChild.nodeType === 1 ? this.firstChild : this.firstChild.nextElementSibling);
  }
  get nextElementSibling() {
    return this.nextSibling && (this.nextSibling.nodeType === 1 ? this.nextSibling : this.nextSibling.nextElementSibling);
  }
  get previousElementSibling() {
    return this.previousSibling && (this.previousSibling.nodeType === 1 ? this.previousSibling : this.previousSibling.previousElementSibling);
  }
  get className() {
    return this.getAttribute('class') || '';
  }
  get id() {
    return this.getAttribute('id') || '';
  }
  get parentElement() {
    return this.parentNode && this.parentNode === 1 ? this.parentNode : null;
  }
  get children() {
    throw new Error('not impl')
  }
  get childNodes() {
    throw new Error('not impl')
  }
  get childElementCount() {
    throw new Error('not impl')
  }
  getElementsByTagNameNS(ns, tag) {
    const els = this.nodeName === tag ? [this] : [];
    let child = this.firstElementChild;
    while (child) {
      els.push(...child.getElementsByTagNameNS(ns, tag));
      child = child.nextElementSibling;
    }
    return els;
  }
  getElementsByTagName(tag) {
    return this.getElementsByTagNameNS('*', tag);
  }
  getElementsByClassName(cn) {
    const els = RegExp(`\\b${cn}\\b`).test(this.className) ? [this] : [];
    let child = this.firstElementChild;
    while (child) {
      els.push(...child.getElementsByClassName(cn));
      child = child.nextElementSibling;
    }
    return els;
  }
  getAttribute(key) {
    return this._attrs.get(key);
  }
  setAttribute(key, value) {
    return this._attrs.set(key, value);
  }
  removeAttribute(key) {
    return this._attrs.delete(key);
  }
}

const createElement = (nodeName, attrs = []) => (...children) => new Element({
  nodeName,
  attrs,
  children
});

const stringifyAttr = el => (el._attrs.size ? ' ' : '') + Array.from(el._attrs, ([k, v]) => `${k}="${v.replace(/["]/g, `'`)}"`).join(' ');

const stringifyChildren = (el, indent = '') => {
  const lines = [];
  let c = el.firstChild;
  while (c) {
    if (c.nodeType !== 1) {
      lines.push(c.textContent);
    } else if (!c.firstElementChild) {
      lines.push(`<${c.localName}${stringifyAttr(c)}>${c.firstChild && c.firstChild.textContent || ''}</${c.localName}>`);
    } else {
      lines.push(
        `<${c.localName}${stringifyAttr(c)}>`,
        ...stringifyChildren(c, indent).map(l => indent + l),
        `</${c.localName}>`
      );
    }
    c = c.nextSibling;
  }
  return lines;
}

const stringify = (el, indent = '') => {
  const EOL = indent ? '\n' : '';

  return [`<${el.localName}${stringifyAttr(el)}>`,
  ...stringifyChildren(el, indent).map(l => indent + l),
  `</${el.localName}>`].join(EOL);
}

const self = {
  DOMException: Error,
  Document,
  Element,
  document: new Document(
    createElement('HEAD')(),
    createElement('BODY')(
      createElement('DIV')(),
      createElement('DIV')(
        createElement('SPAN', [['class', 'foo']])()
      )
    )
  )
};

const nwsapi = nwsapiFactory(self);

console.log(stringify(self.document.firstChild, '  ')); // pretty-print the tree to make sure it's as expected

console.log(nwsapi.select('div', self.document).length);
console.log(nwsapi.select('DIV', self.document).length);
console.log(nwsapi.select('.foo', self.document).length);
console.log(nwsapi.select('[class="foo"]', self.document).length);


// logs:
/*
<html>
  <head></head>
  <body>
    <div></div>
    <div>
      <span class="foo"></span>
    </div>
  </body>
</html>
0 // <-- should be 2
2
1
0 // <-- should be 1
*/