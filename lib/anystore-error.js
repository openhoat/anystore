'use strict';

//const log = require('hw-logger').log;

class AnystoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    this.message = message;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

class NotImplementedError extends AnystoreError {
  constructor(message) {
    super('NOT_IMPLEMENTED', message);
  }
}

class MissingArgumentError extends AnystoreError {
  constructor(message) {
    super('MISSING_ARGUMENT', message);
  }
}

class SchemaValidationError extends AnystoreError {
  constructor(message, schemaErrors) {
    let orig;
    if (message instanceof Error) {
      orig = message;
      message = orig.message;
    }
    super('SCHEMA_VALIDATION', message);
    this.schemaErrors = schemaErrors;
    if (orig) {
      this.orig = orig;
      this.stack = orig.stack;
    }
  }

  toString() {
    return this.schemaErrors ?
      this.schemaErrors.map(item => {
        const instance = typeof item.instance === 'object' ? JSON.stringify(item.instance) : item.instance.toString();
        return `${item.property} with value '${instance}' ${item.message}`;
      }).join(', ') :
      super.toString();
  }
}

class NotFoundError extends AnystoreError {
  constructor(message) {
    super('NOT_FOUND', message);
  }
}

class ConflictError extends AnystoreError {
  constructor(message) {
    super('CONFLICT', message);
  }
}

AnystoreError.NotImplemented = NotImplementedError;
AnystoreError.MissingArgument = MissingArgumentError;
AnystoreError.SchemaValidation = SchemaValidationError;
AnystoreError.NotFound = NotFoundError;
AnystoreError.Conflict = ConflictError;

exports = module.exports = AnystoreError;
