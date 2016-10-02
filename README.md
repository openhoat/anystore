[![NPM version](https://badge.fury.io/js/anystore.svg)](http://badge.fury.io/js/anystore)
[![Build Status](https://travis-ci.org/openhoat/anystore.png?branch=master)](https://travis-ci.org/openhoat/anystore)
[![Coverage Status](https://coveralls.io/repos/openhoat/anystore/badge.svg)](https://coveralls.io/r/openhoat/anystore)
[![npm](https://img.shields.io/npm/l/express.svg?style=flat-square)]()

![Datastore Logo](assets/datastore-logo.png)

## Anystore

Anystore allow you to persist your datas into any store like a simple memory store, or [Redis](http://redis.io/) (soon [MongoDB](http://www.mongodb.org/), [mySQL](http://www.mysql.com/)).

It provides a generic store class that seamlessly wraps a database provider implementation.

## Why?

The goal of this project is to provide a light and easy way to persist JSON datas with indexes and entities associations.

## Installation

```bash
$ npm install anystore --save
```

## Additional provider installation

Depending of the store you want to use, you will need some additional modules :

- Redis :

```bash
$ npm install redis hiredis --save
```

Look at the examples in optionalDependencies of [package.json](https://github.com/openhoat/anystore/blob/master/package.json)

## Getting started

Create an entity and get it back : [example1](https://github.com/openhoat/anystore/tree/master/samples/example1.js)

```
const Anystore = require('anystore');

const store = new Anystore.stores.MemoryStore(); // Default memory store provided for test purpose

store.start()
  .then(() => store.create('Contact', {username: 'doe', firstname: 'John', lastname: 'Doe'}))
  .then(data => {
    console.log('saved data :', data);
    return data.id;
  })
  .then(id => store.load('Contact', id))
  .then(data => {
    console.log('fetched data back again :', data);
  })
  .then(() => store.stop());
```

Result :

```bash
$ node samples/example1
INFO  - anystore:520 - 9ms - loading MemoryStore
INFO  - anystore:512 - 4ms - MemoryStore registered
INFO  - anystore:520 - 1ms - loading RedisStore
INFO  - anystore:512 - 164ms - RedisStore registered
INFO  - anystore:51 - 5ms - MemoryStore sucessfully started
saved data : { username: 'doe',
  firstname: 'John',
  lastname: 'Doe',
  id: 'd8eeec4e-4c20-45ed-8b00-d84ad7f943ee' }
fetched data back again : { username: 'doe',
  firstname: 'John',
  lastname: 'Doe',
  id: 'd8eeec4e-4c20-45ed-8b00-d84ad7f943ee' }
INFO  - anystore:71 - 14ms - MemoryStore closed
```

Anystore is a base class overriden by every store implementation.
All available stores classes are exposed with "stores" static attribute.

## Datastore API doc

Almost all provided methods are asynchronous, they accept a callback as last argument, and return a promise.

### Lifecycle :

- new Anystore(opt) : create a datastore instance and, if opt is given, initialize it
- init(opt) : synchronously initialize the store
- start(opt, cb) : start the datastore (and initialize if needed)
- stop(cb) : stop the datastore

#### Options :

TODO

#### Provider specific options :

- Redis : full list of options as defined in [redis.createClient()](https://github.com/mranney/node_redis#overloading)

### Store features :

All features take a collection name as first argument.

CRUD methods :

- create(type, data, cb) : save a new resource to collection
- load(type, id, cb) : fetch a resource by ID
- update(type, data, cb) : update the resource of given ID
- delete(type, id, cb) : delete the resource from the collection

Extra features :

- list(type, cb) : fetch the resources of collection
- reset(cb) : remove all datas
- dump(cb) : retreive all datas

## Databases support

Currently, following database systems are supported :

- [Redis](http://redis.io/)
- Memory : in-memory store for test purpose

## Use cases

TODO

For more complete examples look at [mocha tests](https://github.com/openhoat/anystore/tree/master/test)

Enjoy !
