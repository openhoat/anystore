'use strict';

const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const Promise = require('bluebird');
const traverse = require('traverse');
const jsonSchema = require('jsonschema');
const uuid = require('uuid');
const AnystoreError = require('./anystore-error');
const logger = require('hw-logger');
const log = logger.log;

class Anystore {
  /**
   * Base class of any store.
   *
   * @class Anystore
   * @constructor
   * @param [opt] {Object} Anystore options
   */
  constructor(opt) {
    opt = opt || {};
    _.defaults(this, _.pick(opt, ['schemas']));
    this._computeSchema();
  }

  /**
   * Optionnal initialization.
   * Use it to pass optional options to the store implementation, like host, port, ... for example.
   *
   * @method init
   * @param [opt] {Object} Store implementation options
   * @return {Boolean} true on success
   */
  init(opt) {
    const result = typeof this._init === 'function'
      ? this._init(opt && _.clone(opt) || {})
      : true;
    this.initialized = true;
    return result;
  }

  /**
   * Start the store.
   *
   * @async
   * @method start
   * @param [opt] {Object} Store implementation options
   * @param [cb] {Function} Callback function
   * @return {Promise} true on success
   */
  start(opt, cb) {
    if (typeof cb === 'undefined' && typeof opt === 'function') {
      cb = opt;
      opt = null;
    }
    opt = opt && _.clone(opt) || {};
    return Promise.resolve()
      .then(() => {
        if (!this.initialized) {
          this.init(opt);
        }
        if (this.started) {
          return false;
        }
        return Promise.resolve()
          .then(() => {
            if (!this.initialized) {
              this.init(opt);
            }
            if (typeof this._start === 'function') {
              return this._start();
            }
          })
          .then(() => {
            this.started = true;
            logger.enabledLevels.info && log.info(`${this.name} sucessfully started`);
            return true;
          });
      })
      .asCallback(cb);
  }

  /**
   * Stop the store.
   *
   * @async
   * @method stop
   * @param [cb] {Function} Callback function
   * @return {Promise} true on success
   */
  stop(cb) {
    return Promise.resolve()
      .then(() => {
        if (!this.started) {
          return false;
        }
        return Promise.resolve()
          .then(() => {
            if (typeof this._stop === 'function') {
              return this._stop();
            }
          })
          .then(() => {
            logger.enabledLevels.info && log.info(`${this.name} closed`);
            return true;
          });
      })
      .asCallback(cb);
  }

  _computeSchema() {
    if (!this.schemas) {
      return;
    }
    const rels = {};
    this.validator = new jsonSchema.Validator();
    this.validator.addSchema(Anystore.idSchema, '/Id');
    for (const schema of this.schemas) {
      if (_.get(schema, 'properties.id')) {
        this.validator.addSchema(Anystore.idSchema, '/Id' + schema.id);
      }
      const jsonSchema = Object.assign({}, _.omit(schema, 'id'), {id: `/${schema.id}`});
      jsonSchema.properties = jsonSchema.properties || {};
      jsonSchema.$update = _.defaults(jsonSchema.$update, {
        required: ['id'],
        minProperties: 2
      });
      Object.assign(jsonSchema.properties, {id: {$ref: '/Id'}});
      this.validator.addSchema(jsonSchema, jsonSchema.id);
      traverse(schema).forEach(function(item) {
        const type = schema.id;
        rels[type] = rels[type] || {indexes: [], links: {}};
        if (this.key === '$target') {
          const key = this.path[1];
          const links = rels[type].links;
          links[key] = links[key] || {};
          const link = links[key];
          link[_.get(schema, this.path.slice(0, 2)).type === 'array' ? 'hasMany' : 'hasOne'] = true;
          link.target = item;
          const as = _.get(schema, this.parent.path).$as;
          if (as) {
            link.as = as;
          }
        } else if (this.key === '$unique') {
          const indexes = rels[type].indexes;
          const key = this.parent.key;
          if (indexes.indexOf(key) === -1) {
            indexes.push({name: key, unique: true});
          }
        } else if (this.key === '$uniqueWith') {
          const indexes = rels[type].indexes;
          const index = [this.parent.key, item];
          if (!indexes
              .reduce((notFound, existingIndex) => {
                if (!Array.isArray(existingIndex.name)) {
                  return false;
                }
                return (index.length === existingIndex.name.length) && index
                    .every((e, i) => existingIndex.name.indexOf(e) !== -1);
              }, false)) {
            indexes.push({name: [this.parent.key, item], unique: true});
          }
        } else if (this.key === '$index') {
          const indexes = rels[type].indexes;
          const key = this.parent.key;
          if (indexes.indexOf(key) === -1) {
            indexes.push({name: key});
          }
        }
      });
    }
    for (const type in rels) {
      const typeRel = rels[type];
      for (const key in typeRel) {
        const itemRel = typeRel[key];
        if (itemRel.target) {
          if (!rels[itemRel.target]) {
            throw new AnystoreError.SchemaValidation(
              `Error in "${type}" schema : target "${itemRel.target}" does not exist`);
          }
          if (itemRel.as) {
            if (!rels[itemRel.target][itemRel.as]) {
              throw new AnystoreError.SchemaValidation(
                `Error in "${type}" schema : target "${itemRel.target}.${itemRel.as}" does not exist`);
            }
          }
        } else {
          if (itemRel.as) {
            throw new AnystoreError.SchemaValidation(
              `Error in "${type}" schema : missing target with as attribute`);
          }
        }
      }
    }
    this.schemaRelations = rels;
  }

  _applyImpl(fnName, ...args) {
    const implFn = this.impl[`_${fnName}`];
    if (typeof implFn !== 'function') {
      throw new AnystoreError
        .NotImplemented(`method "${fnName}" not implemented in store implementation "${this.impl.name}"`);
    }
    return implFn(...args);
  }

  /**
   * Get schema relations.
   *
   * @method getSchemaRelations
   * @return {Object} Schema relation
   */
  getSchemaRelations() {
    return this.schemaRelations;
  }

  /**
   * Validate entity data.
   *
   * @async
   * @method validate
   * @param type {String} Entity type reference
   * @param data {Object} Store implementation options
   * @param [mode=create] {String} Specify operation to use in schema
   * @param [cb] {Function} Callback function
   * @return {Promise} fails on validation error
   */
  validate(type, data, mode = 'create', cb) {
    return Promise.resolve()
      .then(() => {
        if (typeof data !== 'object' || !data) {
          throw new AnystoreError.MissingArgument('missing data');
        }
        if (!this.validator) {
          return;
        }
        const schema = this.validator.getSchema(`/${type}`);
        if (!schema) {
          throw new AnystoreError.SchemaValidation(`schema not found for "${type}"`);
        }
        return Promise.resolve()
          .then(() => {
            const modeSchema = _.chain(schema).omit(['$create', '$update']).assign(schema[`$${mode}`]).value();
            const defaults = Object.keys(modeSchema.properties)
              .filter(name => typeof modeSchema.properties[name].default !== 'undefined')
              .reduce((o, name) => Object.assign(o, {[name]: modeSchema.properties[name].default}), {});
            _.defaults(data, defaults);
            this.validator.schemas[schema.id] = modeSchema;
            const validation = this.validator.validate(data, type);
            if (!validation.valid) {
              logger.enabledLevels.debug && log.debug('validation :', JSON.stringify(validation, null, 2));
              throw new AnystoreError.SchemaValidation('bad data format', validation.errors);
            }
            return Promise.resolve()
              .then(() => {
                const indexes = this.getIndexes(type, data);
                return Promise.each(indexes, index => {
                  if (!index.unique) {
                    return;
                  }
                  const indexValue = Array.isArray(index.name)
                    ? index.name.map(key => data[key])
                    : data[index.name];
                  return this.findByIndex(type, index.name, indexValue)
                    .then(list => {
                      if ((data.id ? list.filter(item => item.id !== data.id) : list).length) {
                        throw new AnystoreError
                          .Conflict(`${type}.${index.name} already exists with value "${indexValue}"`);
                      }
                    });
                });
              });
          })
          .catch(jsonSchema.SchemaError, err => {
            throw new AnystoreError.SchemaValidation(err);
          })
          .finally(() => {
            this.validator.schemas[schema.id] = schema;
          });
      })
      .asCallback(cb);
  }

  getIndexes(type, data) {
    return (this.schemaRelations[type].indexes || [])
      .filter(index => !data || (Array.isArray(index.name)
        ? index.name.reduce((ok, indexName) => ok && typeof data[indexName] !== 'undefined', true)
        : typeof data[index.name] !== 'undefined')
      );
  }

  getLinks(type, data) {
    const links = this.schemaRelations[type] && this.schemaRelations[type].links || {};
    return Object.keys(links).reduce((list, name) => {
      const value = links[name];
      if (value && (!data || typeof data[name] !== 'undefined')) {
        list.push({name, value});
      }
      return list;
    }, []);
  }

  unsetRelations(type, data, cb) {
    return Promise.resolve()
      .then(() => {
        if (!this.validator) {
          return;
        }
        logger.enabledLevels.debug && log.debug(`removing relations for ${type}#${data.id}`);
        if (typeof this._unsetRelations === 'function') {
          return this._unsetRelations(type, data);
        }
        logger.enabledLevels.debug && log.debug(`removing links for ${type}#${data.id}`);
        return Promise.each(this.getLinks(type, data), link => Promise.resolve()
          .then(() => this._load(link.value.target, data[link.name]))
          .then(rData => {
            if (link.value.hasMany) {
              const index = rData[link.value.as].indexOf(data.id);
              if (index !== -1) {
                rData[link.value.as].splice(index, 1);
              }
            } else if (link.value.hasOne) {
              delete rData[link.value.as];
            }
            return this.update(type, rData, {cascade: false});
          })
        );
      })
      .return(data)
      .asCallback(cb);
  }

  setRelations(type, data, cb) {
    return Promise.resolve()
      .then(() => {
        if (!this.validator) {
          return;
        }
        logger.enabledLevels.debug && log.debug(`setting relations for ${type}#${data.id}`);
        if (typeof this._setRelations === 'function') {
          return this._setRelations(type, data);
        }
        logger.enabledLevels.debug && log.debug(`setting links for ${type}#${data.id}`);
        return Promise.each(this.getLinks(type, data), link => Promise.resolve()
          .then(() => this._load(link.value.target, data[link.name]))
          .then(rData => {
            if (link.value.hasMany) {
              rData[link.value.as] = rData[link.value.as] || [];
              rData[link.value.as].push(data.id);
            } else if (link.value.hasOne) {
              rData[link.value.as] = data.id;
            }
            return this.update(type, rData, {cascade: false});
          })
        );
      })
      .return(data)
      .asCallback(cb);
  }

  omitLinks(type, data) {
    const links = this.getLinks(type, data);
    return links.length ? _.omit(data, _.map(links, 'name')) : data;
  }

  load(type, id, opt, cb) {
    if (typeof cb === 'undefined' && typeof opt === 'function') {
      cb = opt;
      opt = null;
    }
    opt = opt && _.clone(opt) || {};
    opt.links = typeof opt.links === 'undefined' || opt.links;
    return Promise.resolve()
      .then(() => {
        if (typeof id !== 'string') {
          throw new AnystoreError.MissingArgument('missing id');
        }
        logger.enabledLevels.debug && log.debug(`loading ${type}#${id}`);
        return this._load(type, id, opt);
      })
      .asCallback(cb);
  }

  create(type, data, opt, cb) {
    if (typeof cb === 'undefined' && typeof opt === 'function') {
      cb = opt;
      opt = null;
    }
    opt = opt && _.clone(opt) || {};
    opt.cascade = typeof opt.cascade === 'undefined' || opt.cascade;
    data = _.cloneDeep(data);
    logger.enabledLevels.debug && log.debug(`creating new ${type}`);
    return Promise.resolve()
      .then(() => this.validate(type, data, 'create'))
      .then(() => {
        data.id = data.id || uuid.v4();
      })
      .then(() => this._create(type, data, opt))
      .then(newData => Promise.resolve()
        .then(() => {
          if (!opt.cascade) {
            return;
          }
          return this.setRelations(type, newData);
        })
        .return(newData)
      )
      .asCallback(cb);
  }

  update(type, data, opt, cb) {
    if (typeof cb === 'undefined' && typeof opt === 'function') {
      cb = opt;
      opt = null;
    }
    opt = opt && _.clone(opt) || {};
    opt.cascade = typeof opt.cascade === 'undefined' || opt.cascade;
    return Promise.resolve()
      .then(() => this.validate(type, data, 'update'))
      .then(() => {
        logger.enabledLevels.debug && log.debug(`updating ${type}#${data.id}`);
        if (typeof this._update !== 'function') {
          return Promise.resolve()
            .then(() => this.delete(type, data.id, opt))
            .then(existingData => this.create(type, _.extend({}, existingData, data), opt));
        }
        return Promise.resolve()
          .then(() => {
            if (!opt.cascade) {
              return;
            }
            return Promise.resolve()
              .then(() => this._load(type, data.id))
              .then(existingData => this.unsetRelations(type, existingData));
          })
          .then(() => this._update(type, data, opt))
          .then(newData => {
            if (!opt.cascade) {
              return;
            }
            return this.setRelations(type, newData);
          });
      })
      .asCallback(cb);
  }

  delete(type, id, opt, cb) {
    if (typeof cb === 'undefined' && typeof opt === 'function') {
      cb = opt;
      opt = null;
    }
    opt = opt && _.clone(opt) || {};
    opt.cascade = typeof opt.cascade === 'undefined' || opt.cascade;
    return Promise.resolve()
      .then(() => {
        logger.enabledLevels.debug && log.debug(`deleting ${type}#${id}`);
        if (typeof id !== 'string') {
          throw new AnystoreError.MissingArgument('missing id');
        }
        if (!opt.cascade) {
          return;
        }
        return Promise.resolve()
          .then(() => this._load(type, id))
          .then(existingData => this.unsetRelations(type, existingData));
      })
      .then(() => this._delete(type, id, opt))
      .asCallback(cb);
  }

  findByIndex(type, indexName, indexValue, cb) {
    return Promise.resolve()
      .then(() => {
        logger.enabledLevels.debug && log.debug(`searching ${type} items with ${indexName}: "${indexValue}"`);
        if (typeof this._findByIndex === 'function') {
          return this._findByIndex(type, indexName, indexValue);
        }
        return this.listOfType(type)
          .filter(item => {
            if (Array.isArray(indexName)) {
              return indexName.reduce((found, key, index) => found && item[key] === indexValue[index], true);
            } else {
              return item[indexName] === indexValue;
            }
          });
      })
      .asCallback(cb);
  }

  listOfType(type, opt, cb) {
    if (typeof cb === 'undefined' && typeof opt === 'function') {
      cb = opt;
      opt = null;
    }
    opt = opt && _.clone(opt) || {};
    opt.links = typeof opt.links === 'undefined' || opt.links;
    return Promise.resolve()
      .then(() => {
        if (typeof type !== 'string') {
          throw new AnystoreError.MissingArgument('missing type');
        }
        logger.enabledLevels.debug && log.debug(`loading ${type} items`);
        return this._listOfType(type, opt);
      })
      .asCallback(cb);
  }

  reset(cb) {
    return Promise.resolve()
      .then(() => {
        if (typeof this._reset === 'function') {
          return this._reset();
        }
        const types = _.map(this.schemas, 'id');
        return Promise.each(types, type => this.listOfType(type)
          .then(list => Promise.map(list, item => this.delete(type, item.id, {cascade: false})))
        );
      })
      .asCallback(cb);
  }

  dump(cb) {
    return Promise.resolve()
      .then(() => {
        const types = _.map(this.schemas, 'id');
        return Promise
          .reduce(types, (dump, type) => this.listOfType(type).then(list => {
            dump[type] = list;
            return dump;
          }), {});
      })
      .asCallback(cb);
  }
}

for (const fnName of ['create', 'load', 'delete']) {
  Anystore.prototype[`_${fnName}`] = function() {
    throw new AnystoreError.NotImplemented(`method "${fnName}" not implemented`);
  };
}

Anystore.Error = AnystoreError;
Anystore.patterns = {
  id: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
};
Anystore.idSchema = {
  type: 'string',
  pattern: Anystore.patterns.id
};
Anystore.stores = {};
Anystore.toStoreName = name => {
  const parts = name.match(/^(.*)(-)?[Ss]tore(.js)?$/);
  if (!parts || !parts[1]) {
    return;
  }
  name = parts[1].substring(0, 1).toUpperCase() + _.camelCase(parts[1].substring(1)) + 'Store';
  return name;
};
Anystore.addStore = (store, name) => {
  name = name || Anystore.toStoreName(store.name);
  Anystore.stores[name] = store;
  logger.enabledLevels.info && log.info(`${name} registered`);
};

const loadDefaultStores = () => {
  const storesDir = path.join(__dirname, 'stores');
  const defaultStoreFiles = fs.readdirSync(storesDir);
  defaultStoreFiles.forEach(defaultStoreFile => {
    const storeName = Anystore.toStoreName(defaultStoreFile);
    logger.enabledLevels.info && log.info(`loading ${storeName}`);
    try {
      const store = require(path.join(storesDir, defaultStoreFile));
      Anystore.addStore(store, storeName);
    } catch (err) {
      logger.enabledLevels.warn && log.warn(`error while loading store ${storeName} :`, err.toString());
    }
  });
};

exports = module.exports = Anystore;

loadDefaultStores();
