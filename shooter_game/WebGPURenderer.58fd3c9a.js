function e(e,t,a,r){Object.defineProperty(e,t,{get:a,set:r,enumerable:!0,configurable:!0})}function t(e){return e&&e.__esModule?e.default:e}var a=globalThis.parcelRequire080b,r=a.register;r("jiAbK",function(t,a){e(t.exports,"localUniformBit",()=>r),e(t.exports,"localUniformBitGroup2",()=>o),e(t.exports,"localUniformBitGl",()=>f);let r={name:"local-uniform-bit",vertex:{header:`

            struct LocalUniforms {
                uTransformMatrix:mat3x3<f32>,
                uColor:vec4<f32>,
                uRound:f32,
            }

            @group(1) @binding(0) var<uniform> localUniforms : LocalUniforms;
        `,main:`
            vColor *= localUniforms.uColor;
            modelMatrix *= localUniforms.uTransformMatrix;
        `,end:`
            if(localUniforms.uRound == 1)
            {
                vPosition = vec4(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
            }
        `}},o={...r,vertex:{...r.vertex,header:r.vertex.header.replace("group(1)","group(2)")}},f={name:"local-uniform-bit",vertex:{header:`

            uniform mat3 uTransformMatrix;
            uniform vec4 uColor;
            uniform float uRound;
        `,main:`
            vColor *= uColor;
            modelMatrix = uTransformMatrix;
        `,end:`
            if(uRound == 1.)
            {
                gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
            }
        `}}}),r("jcFBU",function(t,a){e(t.exports,"textureBit",()=>r),e(t.exports,"textureBitGl",()=>o);let r={name:"texture-bit",vertex:{header:`

        struct TextureUniforms {
            uTextureMatrix:mat3x3<f32>,
        }

        @group(2) @binding(2) var<uniform> textureUniforms : TextureUniforms;
        `,main:`
            uv = (textureUniforms.uTextureMatrix * vec3(uv, 1.0)).xy;
        `},fragment:{header:`
            @group(2) @binding(0) var uTexture: texture_2d<f32>;
            @group(2) @binding(1) var uSampler: sampler;


        `,main:`
            outColor = textureSample(uTexture, uSampler, vUV);
        `}},o={name:"texture-bit",vertex:{header:`
            uniform mat3 uTextureMatrix;
        `,main:`
            uv = (uTextureMatrix * vec3(uv, 1.0)).xy;
        `},fragment:{header:`
        uniform sampler2D uTexture;


        `,main:`
            outColor = texture(uTexture, vUV);
        `}}}),r("fuLup",function(t,r){e(t.exports,"UboSystem",()=>i);var o=a("av3tS"),f=a("135eB"),n=a("iKCKR");class i{constructor(e){this._syncFunctionHash=Object.create(null),this._adaptor=e,this._systemCheck()}_systemCheck(){if(!(0,o.unsafeEvalSupported)())throw Error("Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.")}ensureUniformGroup(e){let t=this.getUniformGroupData(e);e.buffer||(e.buffer=new(0,f.Buffer)({data:new Float32Array(t.layout.size/4),usage:n.BufferUsage.UNIFORM|n.BufferUsage.COPY_DST}))}getUniformGroupData(e){return this._syncFunctionHash[e._signature]||this._initUniformGroup(e)}_initUniformGroup(e){let t=e._signature,a=this._syncFunctionHash[t];if(!a){let r=Object.keys(e.uniformStructures).map(t=>e.uniformStructures[t]),o=this._adaptor.createUboElements(r),f=this._generateUboSync(o.uboElements);a=this._syncFunctionHash[t]={layout:o,syncFunction:f}}return this._syncFunctionHash[t]}_generateUboSync(e){return this._adaptor.generateUboSync(e)}syncUniformGroup(e,t,a){let r=this.getUniformGroupData(e);e.buffer||(e.buffer=new(0,f.Buffer)({data:new Float32Array(r.layout.size/4),usage:n.BufferUsage.UNIFORM|n.BufferUsage.COPY_DST}));let o=null;return t||(t=e.buffer.data,o=e.buffer.dataInt32),a||(a=0),r.syncFunction(e.uniforms,t,o,a),!0}updateUniformGroup(e){if(e.isStatic&&!e._dirtyId)return!1;e._dirtyId=0;let t=this.syncUniformGroup(e);return e.buffer.update(),t}destroy(){this._syncFunctionHash=null}}}),r("cbHmD",function(t,r){e(t.exports,"createUboSyncFunction",()=>f);var o=a("iB51t");function f(e,t,a,r){let f=[`
        var v = null;
        var v2 = null;
        var t = 0;
        var index = 0;
        var name = null;
        var arrayOffset = null;
    `],n=0;for(let i=0;i<e.length;i++){let s=e[i],u=s.data.name,v=!1,c=0;for(let e=0;e<o.uniformParsers.length;e++)if(o.uniformParsers[e].test(s.data)){c=s.offset/4,f.push(`name = "${u}";`,`offset += ${c-n};`,o.uniformParsers[e][t]||o.uniformParsers[e].ubo),v=!0;break}if(!v)if(s.data.size>1)c=s.offset/4,f.push(a(s,c-n));else{let e=r[s.data.type];c=s.offset/4,f.push(`
                    v = uv.${u};
                    offset += ${c-n};
                    ${e};
                `)}n=c}return Function("uv","data","dataInt32","offset",f.join("\n"))}}),r("iB51t",function(t,a){e(t.exports,"uniformParsers",()=>r);let r=[{type:"mat3x3<f32>",test:e=>void 0!==e.value.a,ubo:`
            var matrix = uv[name].toArray(true);
            data[offset] = matrix[0];
            data[offset + 1] = matrix[1];
            data[offset + 2] = matrix[2];
            data[offset + 4] = matrix[3];
            data[offset + 5] = matrix[4];
            data[offset + 6] = matrix[5];
            data[offset + 8] = matrix[6];
            data[offset + 9] = matrix[7];
            data[offset + 10] = matrix[8];
        `,uniform:`
            gl.uniformMatrix3fv(ud[name].location, false, uv[name].toArray(true));
        `},{type:"vec4<f32>",test:e=>"vec4<f32>"===e.type&&1===e.size&&void 0!==e.value.width,ubo:`
            v = uv[name];
            data[offset] = v.x;
            data[offset + 1] = v.y;
            data[offset + 2] = v.width;
            data[offset + 3] = v.height;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.x || cv[1] !== v.y || cv[2] !== v.width || cv[3] !== v.height) {
                cv[0] = v.x;
                cv[1] = v.y;
                cv[2] = v.width;
                cv[3] = v.height;
                gl.uniform4f(ud[name].location, v.x, v.y, v.width, v.height);
            }
        `},{type:"vec2<f32>",test:e=>"vec2<f32>"===e.type&&1===e.size&&void 0!==e.value.x,ubo:`
            v = uv[name];
            data[offset] = v.x;
            data[offset + 1] = v.y;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.x || cv[1] !== v.y) {
                cv[0] = v.x;
                cv[1] = v.y;
                gl.uniform2f(ud[name].location, v.x, v.y);
            }
        `},{type:"vec4<f32>",test:e=>"vec4<f32>"===e.type&&1===e.size&&void 0!==e.value.red,ubo:`
            v = uv[name];
            data[offset] = v.red;
            data[offset + 1] = v.green;
            data[offset + 2] = v.blue;
            data[offset + 3] = v.alpha;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.red || cv[1] !== v.green || cv[2] !== v.blue || cv[3] !== v.alpha) {
                cv[0] = v.red;
                cv[1] = v.green;
                cv[2] = v.blue;
                cv[3] = v.alpha;
                gl.uniform4f(ud[name].location, v.red, v.green, v.blue, v.alpha);
            }
        `},{type:"vec3<f32>",test:e=>"vec3<f32>"===e.type&&1===e.size&&void 0!==e.value.red,ubo:`
            v = uv[name];
            data[offset] = v.red;
            data[offset + 1] = v.green;
            data[offset + 2] = v.blue;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.red || cv[1] !== v.green || cv[2] !== v.blue) {
                cv[0] = v.red;
                cv[1] = v.green;
                cv[2] = v.blue;
                gl.uniform3f(ud[name].location, v.red, v.green, v.blue);
            }
        `}]}),r("8Bwyf",function(t,a){function r(e,t){return`
        for (let i = 0; i < ${e*t}; i++) {
            data[offset + (((i / ${e})|0) * 4) + (i % ${e})] = v[i];
        }
    `}e(t.exports,"uboSyncFunctionsSTD40",()=>o),e(t.exports,"uboSyncFunctionsWGSL",()=>f);let o={f32:`
        data[offset] = v;`,i32:`
        dataInt32[offset] = v;`,"vec2<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];`,"vec3<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];`,"vec4<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 3] = v[3];`,"vec2<i32>":`
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];`,"vec3<i32>":`
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];
        dataInt32[offset + 2] = v[2];`,"vec4<i32>":`
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];
        dataInt32[offset + 2] = v[2];
        dataInt32[offset + 3] = v[3];`,"mat2x2<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 4] = v[2];
        data[offset + 5] = v[3];`,"mat3x3<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 4] = v[3];
        data[offset + 5] = v[4];
        data[offset + 6] = v[5];
        data[offset + 8] = v[6];
        data[offset + 9] = v[7];
        data[offset + 10] = v[8];`,"mat4x4<f32>":`
        for (let i = 0; i < 16; i++) {
            data[offset + i] = v[i];
        }`,"mat3x2<f32>":r(3,2),"mat4x2<f32>":r(4,2),"mat2x3<f32>":r(2,3),"mat4x3<f32>":r(4,3),"mat2x4<f32>":r(2,4),"mat3x4<f32>":r(3,4)},f={...o,"mat2x2<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 3] = v[3];
    `}}),r("2YCip",function(r,o){e(r.exports,"BufferResource",()=>i);var f=a("03hcD"),n=a("aggPd");class i extends t(f){constructor({buffer:e,offset:t,size:a}){super(),this.uid=(0,n.uid)("buffer"),this._resourceType="bufferResource",this._touched=0,this._resourceId=(0,n.uid)("resource"),this._bufferResource=!0,this.destroyed=!1,this.buffer=e,this.offset=0|t,this.size=a,this.buffer.on("change",this.onBufferChange,this)}onBufferChange(){this._resourceId=(0,n.uid)("resource"),this.emit("change",this)}destroy(e=!1){this.destroyed=!0,e&&this.buffer.destroy(),this.emit("change",this),this.buffer=null,this.removeAllListeners()}}}),r("bgKrQ",function(t,r){e(t.exports,"ensureAttributes",()=>n);var o=a("jak2I"),f=a("beUFL");function n(e,t){for(let a in e.attributes){let r=e.attributes[a],f=t[a];f?(r.format??(r.format=f.format),r.offset??(r.offset=f.offset),r.instance??(r.instance=f.instance)):(0,o.warn)(`Attribute ${a} is not present in the shader, but is present in the geometry. Unable to infer attribute details.`)}!function(e){let{buffers:t,attributes:a}=e,r={},o={};for(let e in t){let a=t[e];r[a.uid]=0,o[a.uid]=0}for(let e in a){let t=a[e];r[t.buffer.uid]+=(0,f.getAttributeInfoFromFormat)(t.format).stride}for(let e in a){let t=a[e];t.stride??(t.stride=r[t.buffer.uid]),t.start??(t.start=o[t.buffer.uid]),o[t.buffer.uid]+=(0,f.getAttributeInfoFromFormat)(t.format).stride}}(e)}}),r("hxqER",function(t,r){e(t.exports,"GpuStencilModesToPixi",()=>f);var o=a("apb0P");let f=[];f[o.STENCIL_MODES.NONE]=void 0,f[o.STENCIL_MODES.DISABLED]={stencilWriteMask:0,stencilReadMask:0},f[o.STENCIL_MODES.RENDERING_MASK_ADD]={stencilFront:{compare:"equal",passOp:"increment-clamp"},stencilBack:{compare:"equal",passOp:"increment-clamp"}},f[o.STENCIL_MODES.RENDERING_MASK_REMOVE]={stencilFront:{compare:"equal",passOp:"decrement-clamp"},stencilBack:{compare:"equal",passOp:"decrement-clamp"}},f[o.STENCIL_MODES.MASK_ACTIVE]={stencilWriteMask:0,stencilFront:{compare:"equal",passOp:"keep"},stencilBack:{compare:"equal",passOp:"keep"}},f[o.STENCIL_MODES.INVERSE_MASK_ACTIVE]={stencilWriteMask:0,stencilFront:{compare:"not-equal",passOp:"keep"},stencilBack:{compare:"not-equal",passOp:"keep"}}});