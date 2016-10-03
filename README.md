[![NPM version](https://badge.fury.io/js/anystore.svg)](http://badge.fury.io/js/anystore)
[![Build Status](https://travis-ci.org/openhoat/anystore.png?branch=master)](https://travis-ci.org/openhoat/anystore)
[![Coverage Status](https://coveralls.io/repos/openhoat/anystore/badge.svg)](https://coveralls.io/r/openhoat/anystore)
[![npm](https://img.shields.io/npm/l/express.svg?style=flat-square)]()

![Datastore Logo](assets/img/datastore-logo.png)

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

```javascript
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

Anystore is a base class overriden by every store implementation.
All available stores classes are exposed with "stores" static attribute.

In this example, the store is an instance of MemoryStore class.

Result :

```bash
$ node samples/example1
saved data : { firstname: 'John',
  lastname: 'Doe',
  id: '97ff185e-353c-48c8-b13d-f242ae996c84' }
fetched data back again : { firstname: 'John',
  lastname: 'Doe',
  id: '97ff185e-353c-48c8-b13d-f242ae996c84' }
```

The generated ID is a [UUID v4](https://github.com/broofa/node-uuid).

## Datastore API doc

Almost all provided methods are asynchronous, they accept a callback as last argument, and return a promise.

### Lifecycle :

- new Anystore(opt) : create a datastore instance and, if opt is given, initialize it
- init(opt) : synchronously initialize the store
- start(opt, cb) : start the datastore (and initialize if needed)
- stop(cb) : stop the datastore


### Store features :

All features take a type (collection name) as first argument.

Basic features :

- CRUD : create / read / update / delete an entity
- List all entities of type
- Find any entity by index (schema required)
- Dump the store
- Reset the store

For more information, look at [API doc](https://openhoat.github.io/anystore/)

TODO

#### Options :

TODO

#### Provider specific options :

- Redis : full list of options as defined in [redis.createClient()](https://github.com/mranney/node_redis#overloading)

## Databases support

Currently, following database systems are supported :

- [Redis](http://redis.io/)
- Memory : in-memory store for test purpose

## Use cases

TODO

For more complete examples look at [mocha tests](https://github.com/openhoat/anystore/tree/master/test)

Enjoy !
