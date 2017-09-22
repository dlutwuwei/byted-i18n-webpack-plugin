/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import ModuleFilenameHelpers from 'webpack/lib/ModuleFilenameHelpers';
import globToRegExp from 'glob-to-regexp';

const textTable = {};

/**
 *
 * @param {object|function} localization
 * @param {object|string} Options object or obselete functionName string
 * @constructor
 */
class I18nPlugin {
  constructor(localization, options) {
    if (typeof localization !== 'function') {
      throw new Error('i18n-webpack-plugin: localization must be a function that return the localize text object, like: function() { return { en: { a: "ok"}, ja: {}, pt: {} } }');
    }
    this.localization = localization || {};
    this.options = options || {};
    this.failOnMissing = !!this.options.failOnMissing;
    this.hideMessage = this.options.hideMessage || false;
    this.objectName = this.options.objectName || '__';
    this.fileName = this.options.fileName || '';
    this.fileMap = this.options.fileMap;
    this.outputPath = this.options.outputPath;
    this.devPath = this.options.devPath;
    this.testers = [];
    this.globs = [];
  }

  apply(compiler) {
    const { options, objectName: name, fileName } = this;
    const babelModuleName = `_${fileName}2\\.default`;
    let outputPath = compiler.options.output.path;
    compiler.plugin('compile', () => {
      this.locale = this.localization();
      Object.keys(this.fileMap).forEach((name) => {
        const regex = globToRegExp(name);
        this.testers.push(regex);
        this.globs.push(name);
      });
    });
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('optimize-chunk-assets', (chunks, callback) => {
        const files = [];
        chunks.forEach(chunk => files.push(...chunk.files));
        files.push(...compilation.additionalChunkAssets);
        // 过滤文件支持exclude, include, regex test
        const filteredFiles = files.filter(ModuleFilenameHelpers.matchObject.bind(null, options));
        Object.keys(this.locale).forEach((lan) => {
          textTable[lan] = {};
          filteredFiles.forEach((file) => {
            const asset = compilation.assets[file];
            const input = asset.source();
            const regex = new RegExp(`\\W(${name}|${babelModuleName})\\.\\w+?\\W`, 'g');
            const match = input.match(regex);
            if (match) {
              // be careful of hash code
              let fileName;
              if (process.env.NODE_ENV === 'development') {
                // 开发环境不带hash, 只需去掉后缀
                fileName = file.split('.').slice(0, -1).join('.');
              } else {
                fileName = file.split('.').slice(0, -2).join('.');
              }
              if (this.fileMap) {
                this.testers.forEach((regex, index) => {
                  if (regex.test(fileName)) {
                    fileName = this.fileMap[this.globs[index]];
                  }
                });
              }
              // 获取以及存在的文案表，否则初始化为空对象
              const table = textTable[lan][fileName] || {};
              textTable[lan][fileName] = table;
              match.forEach((item) => {
                const itemName = item.match(/\.(\w+)\W$/)[1];
                table[itemName] = (this.locale[lan] || {})[itemName] || this.locale.en[itemName];
              });
            }
          });
        });
        callback();
      });
    });
    // 编译完成
    compiler.plugin('done', () => {
      Object.keys(this.locale).forEach((lan) => {
        // no output path define;
        let outputFilePath = '';
        if (process.env.NODE_ENV === 'development' && this.devPath) {
          outputPath = this.devPath || process.cwd();
          outputFilePath = path.join(outputPath, `${lan}.text.json`);
        } else {
          outputFilePath = path.join(this.outputPath || outputPath, `${lan}.text.json`);
        }
        const relativeOutputPath = path.relative(process.cwd(), outputFilePath);
        mkdirp.sync(path.dirname(relativeOutputPath));
        fs.writeFileSync(relativeOutputPath.split('?')[0], JSON.stringify(textTable[lan]));
      });
    });
  }
}

export default I18nPlugin;
