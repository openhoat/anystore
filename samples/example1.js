'use strict';

const Anystore = require('../lib/anystore');

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
