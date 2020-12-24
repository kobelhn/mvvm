// es6语法参考：https://es6.ruanyifeng.com/
class MVVM {
    constructor(options = {}) {
        this._options = options;
        this._data = options.data;
        // 数据劫持：通过_Observe劫持传入的data数据，用Object.defineProperty给每个属性添加自定义的get和set方法
        new _Observe(this._data);
        // 数据代理：将data里的属性挂载到当前对象this上
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
        // tips: new 一个class实例时，会调用class里必存在的constructor函数
        // 计算属性
        new _Computed(this);
        // 编译
        new _Compile(this);
    }
}

// 计算属性
class _Computed {
    constructor(vm) {
        // tips: 所有操作都是地址引用，最终修改的是mvvm对象里的内容，这也是所需的，不需要考虑拷贝数据
        this._vm = vm;
        this._computed = vm._options.computed;
        // 在defineProperty内 无法使用this._computed 提前声明一个self后续使用
        const self = this;
        // arrow function 箭头函数不会重置this指向
        // tips: 关于this指向的巩固可以回顾 margin note3 里全面解析this关键字的笔记
        Object.keys(this._computed).map(key => {
            Object.defineProperty(this._vm, key, {
                enumerable: true,
                // this指向绑定里的new 绑定 line 24 使用new 创建对象，这个新对象会绑定到函数调用的this
                // 如果_Computed不使用class语法用new方法调用，使用普通函数定义时，在line 24调用时就需要使用_Computed.call(this)
                // 这里的this指向很重要是由于computed内的方法直接使用到了this 所以需要指定this指向mvvm对象
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
            // 递归劫持，保证所有属性都添加 get 和 set方法
            this.observe(val);
            const self = this;
            Object.defineProperty(data, key, {
                enumerable: true,
                get() {
                    // Dep.target 有方法时订阅
                    Dep.target && dep.addSub(Dep.target);
                    return val;
                },
                set(newVal) {
                    if (newVal !== val) {
                        val = newVal;
                    }
                    // 数据变化时重新劫持
                    self.observe(newVal);
                    // 有数据变化时，发布通知更新数据
                    dep.notify();
                }
            });
        }
    }

    observe(data) {
        // data不为object不需要做任何操作
        if (typeof data === 'object') {
            return new _Observe(data);
        }
    }
}

// 编译html
class _Compile {
    constructor(vm) {
        this._el = document.querySelector(vm._options.el);
        this._vm = vm;
        // 创建空白文档片段 https://developer.mozilla.org/zh-CN/docs/Web/API/Document/createDocumentFragment
        // 转到内存里处理html
        let fragement = document.createDocumentFragment();
        let child = null;
        // 循环加入html元素
        while (child = this._el.firstChild) {
            fragement.appendChild(child);
        }
        this.replace(fragement);
        this._el.appendChild(fragement);
    }

    replace(fragment) {
        // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Array/from
        // Array.from() 方法从一个类似数组或可迭代对象创建一个新的，浅拷贝的数组实例。
        // fragment.childNodes instanceof Array = false 又是个类数组，使用Array.from改变
        Array.from(fragment.childNodes).map(node => {
            let text = node.textContent;
            let reg = /\{\{(.*)\}\}/;
            // nodeType参考：https://developer.mozilla.org/zh-CN/docs/Web/API/Node/nodeType
            // nodeType === 3 为文本节点
            if (node.nodeType === 3 && reg.test(text)) {
                // {{a.a.a}} 获取 ['a', 'a', 'a'] 然后遍历获取最终值
                let arr = RegExp.$1.split('.');
                let val = this._vm;
                arr.map(key => {
                    val = val[key];
                });
                // new一个Watcher实例可以使得Dep对象获得一个拥有update方法的新订阅
                new Watcher(this._vm, RegExp.$1, newVal => {
                    node.textContent = text.replace(reg, newVal);
                });
                node.textContent = text.replace(reg, val);
            }
            // nodeType === 1 为元素节点
            if (node.nodeType === 1) {
                let nodeAttrs = node.attributes;
                // nodeAttrs instanceof Array = false 又是个类数组，使用Array.from改变
                Array.from(nodeAttrs).map(attr => {
                    let name = attr.name;
                    let exp = attr.value;
                    let arr = exp.split('.');
                    // 层层传递找到最终结果并渲染到元素的value属性上
                    if (name.indexOf('v-') === 0) {
                        let val = this._vm;
                        arr.map(key => {
                            val = val[key];
                        });
                        node.value = val;
                    }
                    // new一个Watcher实例可以使得Dep对象获得一个拥有update方法的新订阅
                    new Watcher(this._vm, exp, newVal => {
                        node.value = newVal;
                    });
                    node.addEventListener('input', e => {
                        let newVal = e.target.value;
                        let val2 = this._vm;
                        arr.map((key, index) => {
                            // 正确写法：地址引用
                            // 值发生变化，就会触发数据劫持是放入的set方法，set方法里通知Dep对象发布数据更新的通知
                            if (index === arr.length - 1) {
                                val2[key] = newVal;
                                return;
                            }
                            val2 = val2[key];
                        });
                        // 错误写法：由于到这里是值引用了，赋值操作并不能触发双向数据变化
                        // val2 = newVal;
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

    // 添加新订阅
    addSub(sub) {
        this._subs.push(sub);
    }

    // 发布通知执行所有订阅的upate方法
    notify() {
        this._subs.map(sub => sub.update());
    }

}

// 通过此实例创建的方法都拥有自己的update方法
class Watcher {
    constructor(vm, exp, fn) {
        this._fn = fn;
        this._vm = vm;
        this._exp = exp;
        this._val = null;
        Dep.target = this;
        this.changeVal();
        Dep.target = false;
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
