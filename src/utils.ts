function isType(type: string, name: string, value: any): boolean | TypeError {
    if (typeof value === type) {
        return true;
    }
    throw new TypeError(`${name} is not of type '${type}'`);
}

export { isType };
