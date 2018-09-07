const fsPromises = require('fs').promises;
const util = require('util');
const rally = require('rally');
const rallyConfig = require('./configs/rally-config.js');
const { get } = require('lodash');

const queryUtil = rally.util.query;
const processingDir = './data/images';

const rallyApi = rally({
  user: "",
  pass: ""
});

let configsToProcess;
let globalResolve;
const attachmentsToFetch = [];

rallyConfig.types.forEach((type) => {
  const configsToProcess = getConfigsToProcess(type, rallyConfig);
  const requestOptions = createTypeRequestOptions(type, configsToProcess, rallyConfig.filter);
  return fetch(requestOptions)
    .then((success) => new Promise(resolve => {
      globalResolve = resolve;
      return processDataWithConfigs(success.Results, configsToProcess);
    }))
    .then(value => console.log(JSON.stringify(value, null, 2)))
    .then(fetchAttachments)
    .catch(error => console.log(error));
});

function processDataWithConfigs(dataArray, configs) {
  const promiseMap = dataArray.map(data => Promise.resolve(data));
  return Promise.all(promiseMap)
    .then((results) => {
      return Promise.all(results.map((data) => processConfigs(data, configs)))
    })
    .then(results => globalResolve(results));
}

function processConfigs(data, configs) {
  const promiseMap = configs.map(config => {
    const value = configProcessor(config, data);

    return Promise.resolve(value);
  });

  return Promise.all(promiseMap)
    .then(success => {
      const processedData = {};
      success.forEach(item => {
        processedData[item.key] = item.value;
      })
      return processedData;
    })
    .catch(error => console.log(error));
}

function configProcessor (config, data) {
  let value = `Type was not supplied for confg: ${config.rallyApiField}.`;

  if (config.type) {
    switch (config.type.toLowerCase()) {
      case 'string':
        return processStringType(data, config);
        break;
      case 'collection':
        return processCollectionType(data, config);
      case 'mediacollection':
        return processMediaCollectionType(data, config);
        return
      default:
        value = `Unknown Type of ${config.type} supplied`;
    };
  }

  return value;
}

function processStringType(data, config) {
  const locationInData = config.locationInData || config.rallyApiField;
  const prefix = config.prefix || '';
  const postfix = config.postfix || '';
  return {
    key: config.rallyApiField,
    value: `${prefix}${get(data, locationInData)}${postfix}`
  };
}

function processCollectionType(data, config) {
  const locationInData = config.locationInData || config.rallyApiField;
  const refObject = get(data, locationInData);

  return fetch(createRefRequestOptions(refObject))
    .then((success) => {

      const formattedData = {
        key: config.rallyApiField,
        value: [],
      }

      if(success.Results.length > 0) {
        formattedData.value = success.Results.map(item => {
          return config.collectionFieldConfigs.map(field => configProcessor(field, item));
        });
      }

      return formattedData;
    })
    .catch(error => console.log(error));
}

function processMediaCollectionType(data, config) {
  const locationInData = config.locationInData || config.rallyApiField;
  const refObject = get(data, locationInData);

  return fetch(createRefRequestOptions(refObject))
    .then((success) => {

      const formattedData = {
        key: config.rallyApiField,
        value: [],
      }

      if(success.Results.length > 0) {
        formattedData.value = success.Results.map(item => {
          const mediaUrl = configProcessor(config.mediaUrlConfig, item);
          storeMediaObjForFetchingLater(item, config);
          return mediaUrl;
        });
      }

      return formattedData;
    })
    .catch(error => console.log(error));
}

function storeMediaObjForFetchingLater(data, config) {
  const refObject = get(data, config.mediaRefObjectLocation);
  attachmentsToFetch.push({
    fileName: data[config.mediaUrlConfig.rallyApiField],
    content: fetch(createRefRequestOptions(refObject)),
  });
}

function fetchAttachments() {
  return new Promise((resolve) => {
    attachmentsFetched = resolve;
    const promiseMap = attachmentsToFetch.map(({content}) => content);

    Promise.all(promiseMap)
      .then((mediaData) => {
        const saveMediaPromise = mediaData.map((media, index) =>
          fsPromises.writeFile(
            `${processingDir}/${attachmentsToFetch[index].fileName}`,
            Buffer.from(media.Content, 'base64'),
            {encoding: 'binary'}
          )
        );

        Promise.all(saveMediaPromise)
          .then(() => resolve());
      });
  });
}

function getConfigsToProcess(type, configs) {
  let fields = [
    ...configs.globalConfigs
  ]

  const typeConfigs = configs[`${type}Configs`];
  if (Array.isArray(typeConfigs)) {
    fields = [
      ...fields,
      ...typeConfigs,
    ]
  }

  return fields
}

function createTypeRequestOptions(type, fetchConfigs, filterConfig) {
  return {
    type,
    fetch: generateFetchData(fetchConfigs),
    query: generateQuery(filterConfig),
  }
}

function createRefRequestOptions(ref, fetchConfigs, filterConfig) {
  return {
    ref,
    // fetch: generateFetchData(fetchConfigs),
    // query: generateQuery(filterConfig),
  }
}

function generateFetchData(config) {
  const { globalConfigs } = config;

  return config.map(({rallyApiField}) => rallyApiField);


  return fields;
}

function generateQuery(filters) {
  let query;

  filters.forEach((filter, index) => {
    query = (index === 0)
      ? queryUtil.where(...filter)
      : query.and(...filter)
  });

  return query;
}

function fetch(options, cb) {
  return rallyApi.query(options);
}
