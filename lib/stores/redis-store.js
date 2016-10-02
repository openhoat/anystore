'use strict';

const Promise = require('bluebird');
const redis = require('redis');
Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);
const _ = require('lodash');
const Anystore = require('../anystore');
const logger = require('hw-logger');
const log = logger.log;
const redisSupportedOpts = ['host', 'port', 'path', 'url', 'parser', 'string_numbers',
  'return_buffers', 'detect_buffers', 'socket_keepalive', 'enable_offline_queue',
  'retry_max_delay', 'connect_timeout', 'max_attempts', 'retry_unfulfilled_commands',
  'password', 'family', 'disable_resubscribing', 'rename_commands', 'tls'];

class RedisStore extends Anystore {
  constructor(opt) {
    super(opt);
    this.name = this.constructor.name;
    this.redisConfig = _.defaults({
      host: process.env['REDIS_HOST'] || '127.0.0.1',
      port: process.env['REDIS_PORT'] ? parseInt(process.env['REDIS_PORT']) : 6379,
    }, _.pick(opt, redisSupportedOpts));
    this.config = _.extend({
      prefix: 'anystore',
      idxPrefix: 'idx'
    }, _.omit(opt, redisSupportedOpts));
  }

  toHash(...hashes) {
    if (hashes.length === 1) {
      hashes = hashes[0].split(':');
    }
    hashes.splice(0, 0, this.config.prefix);
    return _.compact(hashes.map(item => (Array.isArray(item) ? item.join(':') : item))).join(':');
  }

  _start() {
    return Promise.resolve()
      .then(() => {
        this.cli = redis.createClient(this.redisConfig);
        if (!this.config.db) {
          return;
        }
        return this.cli.selectAsync(this.config.db);
      })
      .then(() => {
        logger.enabledLevels.info && log.info('redis client connected');
      });
  }

  _stop() {
    return this.cli.quitAsync()
      .then(() => {
        logger.enabledLevels.info && log.info('redis client closed');
      });
  }

  _create(type, data) {
    return Promise.resolve()
      .then(() => {
        const k = this.toHash(type, data.id);
        data = this.omitLinks(type, data);
        return this.cli.hmsetAsync(k, data);
      })
      .return(data);
  }

  _load(type, id, opt) {
    opt = opt || {};
    const k = this.toHash(type, id);
    return this.cli.hgetallAsync(k)
      .then(data => Promise.resolve()
        .then(() => {
          if (data === null) {
            throw new Anystore.Error.NotFound(`No data found for "${type}${id}"`);
          }
          if (!opt.links) {
            return;
          }
          const links = this.getLinks(type);
          return Promise
            .each(links, link => {
              const k = this.toHash(this.config.idxPrefix, type, link.name, id);
              return (link.value.hasMany ? this.cli.smembersAsync(k) : this.cli.getAsync(k))
                .then(value => {
                  if (!value || (!value.length && link.value.hasMany)) {
                    return;
                  }
                  Object.assign(data, {[link.name]: value});
                });
            });
        })
        .return(data)
      );
  }

  _delete(type, id) {
    const k = this.toHash(type, id);
    return this._load(type, id)
      .then(data => this.cli.delAsync(k)
        .return(data)
      );
  }

  _listOfType(type) {
    return Promise.resolve()
      .then(() => this.cli.keysAsync(this.toHash(type, '*'))
        .then(keys => Promise
          .map(keys, k => {
            const id = _.last(k.split(':'));
            return this._load(type, id);
          })
        )
      );
  }

  _unsetRelations(type, data) {
    return Promise.resolve()
      .then(() => {
        logger.enabledLevels.debug && log.debug(`removing indexes for ${type}#${data.id}`);
        return Promise
          .each(this.getIndexes(type, data), index => {
            if (index.unique) {
              const args = [this.config.idxPrefix, type]
                .concat(index.name)
                .concat(Array.isArray(index.name) ? index.name.map(name => data[name]) : data[index.name]);
              const k = this.toHash(...args);
              return this.cli.delAsync(k);
            } else {
              const k = this.toHash(this.config.idxPrefix, type, index.name, data[index.name]);
              return this.cli.sremAsync(k, data.id);
            }
          });
      })
      .then(() => {
        logger.enabledLevels.debug && log.debug(`removing links for ${type}#${data.id}`);
        return Promise
          .each(this.getLinks(type, data), link => Promise.resolve()
            .then(() => {
              if (link.value.hasMany) {
                return Promise.map(data[link.name], value => {
                  const args = [this.config.idxPrefix, type]
                    .concat(link.name)
                    .concat(data.id);
                  const k = this.toHash(...args);
                  return this.cli.sremAsync(k, value);
                });
              } else {
                const k = this.toHash(this.config.idxPrefix, type, link.name, data.id);
                return this.cli.delAsync(k);
              }
            })
            .then(() => {
              const rLinks = this.getLinks(link.value.target);
              const rLink = _.first(rLinks.filter(rLink => rLink.name === link.value.as));
              if (rLink.value.hasMany) {
                return Promise.map(data[link.name], value => {
                  const args = [this.config.idxPrefix, link.value.target]
                    .concat(rLink.name)
                    .concat(value);
                  const k = this.toHash(...args);
                  return this.cli.sremAsync(k, data.id);
                });
              } else {
                const k = this.toHash(this.config.idxPrefix, link.value.target, rLink.name, value);
                const value = data[link.name];
                return this.cli.delAsync(k);
              }
            })
          );
      })
      .return(data);
  }

  _setRelations(type, data) {
    return Promise.resolve()
      .then(() => {
        logger.enabledLevels.debug && log.debug(`setting indexes for ${type}#${data.id}`);
        return Promise
          .each(this.getIndexes(type, data), index => {
            if (index.unique) {
              const args = [this.config.idxPrefix, type]
                .concat(index.name)
                .concat(Array.isArray(index.name) ? index.name.map(name => data[name]) : data[index.name]);
              const k = this.toHash(...args);
              return this.cli.setAsync(k, data.id);
            } else {
              const k = this.toHash(this.config.idxPrefix, type, index.name, data[index.name]);
              return this.cli.saddAsync(k, data.id);
            }
          });
      })
      .then(() => {
        logger.enabledLevels.debug && log.debug(`setting links for ${type}#${data.id}`);
        return Promise
          .each(this.getLinks(type, data), link => Promise.resolve()
            .then(() => {
              if (link.value.hasMany) {
                return Promise.map(data[link.name], value => {
                  const args = [this.config.idxPrefix, type]
                    .concat(link.name)
                    .concat(data.id);
                  const k = this.toHash(...args);
                  return this.cli.saddAsync(k, value);
                });
              } else {
                const k = this.toHash(this.config.idxPrefix, type, link.name, data.id);
                const value = data[link.name];
                return this.cli.setAsync(k, value);
              }
            })
            .then(() => {
              const rLinks = this.getLinks(link.value.target);
              const rLink = _.first(rLinks.filter(rLink => rLink.name === link.value.as));
              if (rLink.value.hasMany) {
                return Promise.map(data[link.name], value => {
                  const args = [this.config.idxPrefix, link.value.target]
                    .concat(rLink.name)
                    .concat(value);
                  const k = this.toHash(...args);
                  return this.cli.saddAsync(k, data.id);
                });
              } else {
                const k = this.toHash(this.config.idxPrefix, link.value.target, rLink.name, value);
                const value = data[link.name];
                return this.cli.setAsync(k, data.id);
              }
            })
          );
      })
      .return(data);
  }

  _reset() {
    return this.cli.keysAsync(this.toHash('*'))
      .map(key => this.cli.delAsync(key));
  }

}

exports = module.exports = RedisStore;
