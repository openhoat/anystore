'use strict';

const _ = require('lodash');
const Anystore = require('../anystore');
//const log = require('hw-logger').log;

class MemoryStore extends Anystore {
  constructor(opt) {
    super(opt);
    this.name = this.constructor.name;
  }

  _init() {
    this.store = {};
  }

  _create(type, data) {
    this.store[type] = this.store[type] || {};
    const typeValues = this.store[type];
    typeValues[data.id] = _.cloneDeep(data);
    return typeValues[data.id];
  }

  _load(type, id, opt) {
    opt = opt || {};
    const data = _.get(this.store, `${type}.${id}`);
    if (!data) {
      throw new Anystore.Error.NotFound(`No data found for "${type}${id}"`);
    }
    return opt.links ? data : this.omitLinks(type, data);
  }

  /*
   _update(type, data) {
   const loadedData = _.get(this.store, `${type}.${data.id}`);
   if (!loadedData) {
   throw new Anystore.Error.NotFound(`No data found for id "${data.id}"`);
   }
   Object.assign(loadedData, data);
   return loadedData;
   }
   */

  _delete(type, id) {
    const loadedData = _.get(this.store, `${type}.${id}`);
    if (!loadedData) {
      throw new Anystore.Error.NotFound(`No data found for id "${id}"`);
    }
    delete this.store[type][id];
    return loadedData;
  }

  _listOfType(type, opt) {
    const list = this.store[type] || [];
    return _.map(list, (data, key) =>
      Object.assign(opt.links ? data : this.omitLinks(type, data), {id: key}));
  }

  _dump() {
    return _.cloneDeep(this.store);
  }

  _reset() {
    for (const type in this.store) {
      delete this.store[type];
    }
  }

}

exports = module.exports = MemoryStore;
