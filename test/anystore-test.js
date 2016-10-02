'use strict';

const chai = require('chai');
const expect = chai.expect;
const _ = require('lodash');
const Anystore = require('../lib/anystore');
//const log = require('hw-logger').log;

const patterns = {firstname: "^[A-Z]{1}[a-zA-Z ,.'-]+$", lastname: "^[a-zA-Z ,.'-]+$"};
const schemas = [{
  id: 'Contact',
  type: 'object',
  properties: {
    username: {type: 'string', $unique: true},
    firstname: {type: 'string', pattern: patterns.firstname, $uniqueWith: 'lastname'},
    lastname: {type: 'string', pattern: patterns.lastname, $uniqueWith: 'firstname'},
    genre: {type: 'string', enum: ['male', 'female'], default: 'male', $index: true},
    friendsIds: {type: 'array', items: {$target: 'Contact', $as: 'friendsIds'}},
    fatherId: {$target: 'Contact', $as: 'sonsIds'},
    sonsIds: {type: 'array', items: {$target: 'Contact', $as: 'fatherId'}},
    companyId: {$target: 'Company', $as: 'employeesIds'}
  },
  additionalProperties: false,
  $create: {
    required: ['username', 'firstname', 'lastname']
  }
}, {
  id: 'Company',
  type: 'object',
  properties: {
    name: {type: 'string'},
    employeesIds: {type: 'array', items: {$target: 'Contact', $as: 'companyId'}}
  },
  additionalProperties: false,
  $create: {
    required: ['name']
  }
}];

const stores = [
  new Anystore.stores.MemoryStore({schemas}),
  new Anystore.stores.RedisStore({schemas, prefix: 'anystore-test'})
];

describe('anystore', () => {

  stores.forEach(store => {

    const contacts = [
      {username: 'doe', firstname: 'John', lastname: 'Doe', genre: 'male'},
      {username: 'kkob', firstname: 'Kurt', lastname: 'Kob', genre: 'male'},
      {username: 'bad', firstname: 'bad first name', genre: 'male'}
    ];

    describe(store.name, () => {

      before(() => store.start().then(() => store.reset()));

      after(() => store.stop());

      describe('crud contact', () => {

        it('should create contact #1', () => store.create('Contact', contacts[0])
          .then(data => {
            expect(data).to.be.ok;
            expect(data).to.have.property('id');
            expect(_.omit(data, 'id')).to.eql(contacts[0]);
            contacts[0].id = data.id;
          })
        );

        it('should read contact #1', () => store.load('Contact', contacts[0].id)
          .then(data => {
            expect(data).to.be.ok;
            expect(data).to.eql(contacts[0]);
          })
        );

        it('should update contact #1', () => store.update('Contact', {id: contacts[0].id, firstname: 'Jane'})
          .then(data => {
            expect(data).to.be.ok;
            expect(data).to.eql(Object.assign({}, contacts[0], {firstname: 'Jane'}));
          })
        );

        it('should read updated contact #1', () => store.load('Contact', contacts[0].id)
          .then(data => {
            expect(data).to.be.ok;
            expect(data).to.eql(Object.assign({}, contacts[0], {firstname: 'Jane'}));
          })
        );

        it('should delete contact #1', () => store.delete('Contact', contacts[0].id));

        it('should fail to read deleted contact #1', () => store.load('Contact', contacts[0].id)
          .then(data => {
            expect(data).to.be.undefined;
          }, err => {
            expect(err).to.be.ok;
            expect(err).to.be.an.instanceOf(Error);
            expect(err).to.be.an.instanceOf(Anystore.Error);
            expect(err).to.be.an.instanceOf(Anystore.Error.NotFound);
            expect(err).to.have.property('code', 'NOT_FOUND');
            expect(err).to.have.property('message');
          })
        );

        it('should create another contact #1', () => store.create('Contact', _.omit(contacts[0], 'id'))
          .then(data => {
            expect(data).to.be.ok;
            expect(data).to.have.property('id');
            expect(_.omit(data, ['id'])).to.eql(_.omit(contacts[0], ['id']));
            contacts[0].id = data.id;
          })
        );

        it('should create contact #2', () => store.create('Contact', contacts[1])
          .then(data => {
            expect(data).to.be.ok;
            expect(data).to.have.property('id');
            expect(_.omit(data, ['id'])).to.eql(_.omit(contacts[1], ['id']));
            contacts[1].id = data.id;
          })
        );

        it('should list all contacts', () => store.listOfType('Contact')
          .then(list => {
            expect(list).to.be.ok;
            expect(list).to.be.an('array').of.length(2);
            for (const item of contacts.slice(0, 1)) {
              expect(list).to.include(item);
            }
            for (const item of list) {
              expect(contacts).to.include(item);
            }
          })
        );

        it('should delete contacts #1 and #2', () => store.delete('Contact', contacts[0].id)
          .then(() => store.delete('Contact', contacts[1].id))
        );

      });

      describe('validation', () => {

        it('should fail create bad contact #3', () => store.create('Contact', _.omit(contacts[2], 'id'))
          .then(data => {
            expect(data).to.be.undefined;
          }, err => {
            //log.warn('err :', err);
            expect(err).to.be.ok;
            expect(err).to.be.an.instanceOf(Error);
            expect(err).to.be.an.instanceOf(Anystore.Error);
            expect(err).to.be.an.instanceOf(Anystore.Error.SchemaValidation);
            expect(err).to.have.property('code', 'SCHEMA_VALIDATION');
            expect(err).to.have.property('message');
            expect(err).to.have.property('schemaErrors');
            expect(err.toString()).to.eql([
              `instance.firstname with value '${contacts[2].firstname}' does not match pattern "${patterns.firstname}"`,
              `instance with value '${JSON.stringify(contacts[2])}' requires property "lastname"`
            ].join(', '));
            expect(err.schemaErrors).to.be.an('array').of.length(2);
            expect(err.schemaErrors[0]).to.have.property('argument', patterns.firstname);
            expect(err.schemaErrors[0]).to.have.property('instance', contacts[2].firstname);
            expect(err.schemaErrors[0]).to.have.property('message', `does not match pattern "${patterns.firstname}"`);
            expect(err.schemaErrors[0]).to.have.property('name', 'pattern');
            expect(err.schemaErrors[0]).to.have.property('property', 'instance.firstname');
            expect(err.schemaErrors[0]).to.have.property('schema').that.eql({
              $uniqueWith: 'lastname',
              pattern: patterns.firstname,
              type: 'string'
            });
            expect(err.schemaErrors[0]).to.have.property('stack',
              `instance.firstname does not match pattern "${patterns.firstname}"`);
            expect(err.schemaErrors[1]).to.have.property('argument', 'lastname');
            expect(err.schemaErrors[1]).to.have.property('instance').that.eql(_.omit(contacts[2], 'id'));
            expect(err.schemaErrors[1]).to.have.property('message', 'requires property "lastname"');
            expect(err.schemaErrors[1]).to.have.property('name', 'required');
            expect(err.schemaErrors[1]).to.have.property('property', 'instance');
            expect(err.schemaErrors[1]).to.have.property('schema', '/Contact');
            expect(err.schemaErrors[1]).to.have.property('stack', 'instance requires property "lastname"');

          })
        );

      });

      describe('relations', () => {

        it('should create 2 contacts', () => store.create('Contact', _.omit(contacts[0], 'id'))
          .then(data => {
            contacts[0].id = data.id;
            return store.create('Contact', _.omit(contacts[1], 'id'))
              .then(data => {
                contacts[1].id = data.id;
              });
          })
        );

        it('should set contact #1 and #2 as friends', () => store
          .update('Contact', {id: contacts[0].id, friendsIds: [contacts[1].id]})
          .then(data => {
            expect(data).to.be.ok;
            expect(_.omit(data, 'friendsIds')).to.eql(contacts[0]);
            expect(data).to.have.property('friendsIds').that.eql([contacts[1].id]);
          })
          .then(() => store.load('Contact', contacts[1].id))
          .then(data => {
            expect(data).to.be.ok;
            expect(_.omit(data, 'friendsIds')).to.eql(contacts[1]);
            expect(data).to.have.property('friendsIds').that.eql([contacts[0].id]);
          })
        );

      });

      describe('unicity', () => {

        const contacts = [
          {username: 'doe', firstname: 'John', lastname: 'Doe', genre: 'male'},
          {username: 'doe', firstname: 'Jane', lastname: 'Doe', genre: 'female'},
          {username: 'johndoe', firstname: 'John', lastname: 'Doe', genre: 'male'}
        ];

        it('should fail create twice same username', () => store.create('Contact', _.omit(contacts[0], 'id'))
          .then(() => store.create('Contact', _.omit(contacts[1], 'id')))
          .then(data => {
            expect(data).to.be.undefined;
          }, err => {
            //log.warn('err :', err);
            expect(err).to.be.ok;
            expect(err).to.be.an.instanceOf(Error);
            expect(err).to.be.an.instanceOf(Anystore.Error);
            expect(err).to.be.an.instanceOf(Anystore.Error.Conflict);
            expect(err).to.have.property('code', 'CONFLICT');
            const contact = contacts[0];
            expect(err).to.have.property('message', `Contact.username already exists with value "${contact.username}"`);
          })
          .then(() => store.create('Contact', _.omit(contacts[2], 'id')))
          .then(data => {
            expect(data).to.be.undefined;
          }, err => {
            //log.warn('err :', err);
            expect(err).to.be.ok;
            expect(err).to.be.an.instanceOf(Error);
            expect(err).to.be.an.instanceOf(Anystore.Error);
            expect(err).to.be.an.instanceOf(Anystore.Error.Conflict);
            expect(err).to.have.property('code', 'CONFLICT');
            const contact = contacts[0];
            expect(err).to.have.property('message',
              `Contact.firstname,lastname already exists with value "${contact.firstname},${contact.lastname}"`);
          })
        );

      });

    });

  });

});
