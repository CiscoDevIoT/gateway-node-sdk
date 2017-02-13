export default function(...args) {
    let [defaultValue, ...others] = args;
    let map;
    if (defaultValue instanceof Object) {
        map = new WeakMap(...args);
    } else {
        map = new WeakMap(...others);
        map._defaultValue = defaultValue
    }
    let _get = map.get;
    map.get = (...getArgs) => {
        let key = getArgs[0];
        if (!map.has(key)) {
            return defaultValue;
        } else {
            return _get.apply(map, getArgs);
        }
    }
    return map;
}
