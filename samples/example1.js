'use strict';

const Anystore = require('../lib/anystore');

const store = new Anystore.stores.MemoryStore();

store.start()
  .then(() => store.create('Contact', {
    firstname: 'John',
    lastname: 'Doe'
  }))
  .then(data => {
    console.log('saved data :', data);
    return data.id;
  })
  .then(id => store.load('Contact', id))
  .then(data => {
    console.log('fetched data back again :', data);
  })
  .then(() => store.stop());
