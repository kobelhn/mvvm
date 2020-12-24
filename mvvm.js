// 语法参考：https://es6.ruanyifeng.com/

class MVVM {
    constructor(options = {}) {
        this._options = options;
        this._data = options.data;
        // 数据劫持
        new _Observe(this._data);
        // 数据代理
        for (let key in this._data) {
            Object.defineProperty(this, key, {
                enumerable: true,
                get() {
                    return this._data[key];
                },
                set(newVal) {
                    this._data[key] = newVal;
                }
            })
        }
        new _Computed(this);
        // 编译
        new _Compile(this._options.el, this);
    }
}

// computed
class _Computed {
    constructor(vm) {
        this._vm = vm;
        this._computed = vm._options.computed;
        const self = this;
        Object.keys(this._computed).map(key => {
            console.log(self._computed[key]);
            Object.defineProperty(this._vm, key, {
                enumerable: true,
                get: typeof self._computed[key] === 'function' ? self._computed[key] : self._computed[key].get
            })
        })
    }
}

// 观察者
class _Observe {
    constructor(data) {
        this._data = data;
        let dep = new Dep();
        for (let key in data) {
            let val = data[key];
            this.observe(val);
            const self = this;
            Object.defineProperty(data, key, {
                enumerable: true,
                get() {
                    Dep.target && dep.addSub(Dep.target);
                    return val;
                },
                set(newVal) {
                    if (newVal !== val) {
                        val = newVal;
                    }
                    self.observe(newVal);
                    dep.notify();
                }
            });
        }
    }

    observe(data) {
        if (typeof data === 'object') {
            return new _Observe(data);
        }
    }
}

// 编译
class _Compile {
    constructor(el, vm) {
        this._el = document.querySelector(el);
        this._vm = vm;
        let fragement = document.createDocumentFragment();
        let child = null;
        while (child = this._el.firstChild) {
            fragement.appendChild(child);
        }
        this.replace(fragement);
        this._el.appendChild(fragement);
    }

    replace(fragment) {
        Array.from(fragment.childNodes).map(node => {
            let text = node.textContent;
            let reg = /\{\{(.*)\}\}/;
            if (node.nodeType === 3 && reg.test(text)) {
                let arr = RegExp.$1.split('.');
                let val = this._vm;
                arr.map(key => {
                    val = val[key];
                });
                new Watcher(this._vm, RegExp.$1, newVal => {
                    node.textContent = text.replace(reg, newVal);
                });
                node.textContent = text.replace(reg, val);
            }
            if (node.nodeType === 1) {
                let nodeAttrs = node.attributes;
                Array.from(nodeAttrs).map(attr => {
                    let name = attr.name;
                    let exp = attr.value;
                    if (name.indexOf('v-') === 0) {
                        node.value = this._vm[exp];
                    }
                    new Watcher(this._vm, exp, newVal => {
                        node.value = newVal;
                    });
                    node.addEventListener('input', e => {
                        let newVal = e.target.value;
                        this._vm[exp] = newVal;
                    })
                });
            }
            if (node.childNodes) {
                this.replace(node);
            }
        });
    }
}

// 发布订阅模式
class Dep {
    constructor() {
        this._subs= [];
    }

    addSub(sub) {
        this._subs.push(sub);
    }

    notify() {
        this._subs.map(sub => sub.update());
    }

}

class Watcher {
    constructor(vm, exp, fn) {
        this._fn = fn;
        this._vm = vm;
        this._exp = exp;
        this._val = null;
        Dep.target = this;
        this.changeVal();
        Dep.target = null;
    }

    changeVal() {
        let val = this._vm;
        let arr = this._exp.split('.');
        arr.map(key => {
            val = val[key];
        });
        this._val = val;
    }

    update() {
        this.changeVal();
        this._fn(this._val);
    }
}
