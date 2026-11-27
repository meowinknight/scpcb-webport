/* ============================================================================
   SCP – Containment Breach · web engine
   Loaders for the game's real file formats (.rmesh, .x text, .b3d, .png/.jpg,
   .ogg) + a small WebGL2 renderer + triangle-grid collision.
   Assets are fetched by their ORIGINAL paths; lookups are case-insensitive via
   manifest.json because Blitz3D is case-insensitive and web servers are not.
   ========================================================================== */
"use strict";
const Eng = (() => {
const RAD = Math.PI / 180;
const E = { RoomScale: 8.0 / 2048.0, log: [], warn(m){ if(E.log.length < 60) E.log.push(m); console.warn(m); } };

/* ---------------------------------------------------------------- file layer */
let manifest = null, loaded = 0, requested = 0;
E.progress = () => (requested ? loaded / requested : 0);
E.loadManifest = async () => { manifest = await (await fetch('manifest.json')).json(); };
const keyOf = p => p.replace(/\\/g, '/').toLowerCase();
E.real = p => manifest.files[keyOf(p)] || null;
E.has = p => !!E.real(p);
async function getBuf(p){
  const r = E.real(p); if(!r) throw new Error('not in manifest: ' + p);
  requested++;
  const res = await fetch(encodeURI(r)); if(!res.ok) throw new Error(res.status + ' ' + r);
  const b = await res.arrayBuffer(); loaded++; return b;
}
E.getBuf = getBuf;

/* ------------------------------------------------------------------- math */
const mat = {
  ident(){ const m = new Float32Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; },
  mul(a, b){            // column-major  a*b
    const o = new Float32Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++){
      o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    }
    return o;
  },
  persp(fovy, asp, n, f){
    const t = 1/Math.tan(fovy/2), m = new Float32Array(16);
    m[0]=t/asp; m[5]=t; m[10]=(f+n)/(n-f); m[11]=-1; m[14]=2*f*n/(n-f); return m;
  },
  trs(pos, yaw, pitch, roll, sc){    // Blitz order: yaw(Y) * pitch(X) * roll(Z), then scale
    const sy=Math.sin(yaw*RAD), cy=Math.cos(yaw*RAD), sp=Math.sin(pitch*RAD), cp=Math.cos(pitch*RAD), sr=Math.sin(roll*RAD), cr=Math.cos(roll*RAD);
    // rotZ(roll): x'=x cr - y sr ; y'=x sr + y cr
    // rotX(pitch): y'=y cp - z sp ; z'=y sp + z cp
    // rotY(yaw):   x'=x cy - z sy ; z'=x sy + z cy
    const Rz = [cr,sr,0, -sr,cr,0, 0,0,1];                // columns
    const Rx = [1,0,0, 0,cp,sp, 0,-sp,cp];
    const Ry = [cy,0,sy, 0,1,0, -sy,0,cy];
    const m3 = (A,B)=>{ const o=new Array(9); for(let c=0;c<3;c++) for(let r=0;r<3;r++) o[c*3+r]=A[r]*B[c*3]+A[3+r]*B[c*3+1]+A[6+r]*B[c*3+2]; return o; };
    const R = m3(Ry, m3(Rx, Rz));
    const m = new Float32Array(16);
    for(let c=0;c<3;c++){ m[c*4]=R[c*3]*sc[c]; m[c*4+1]=R[c*3+1]*sc[c]; m[c*4+2]=R[c*3+2]*sc[c]; }
    m[12]=pos[0]; m[13]=pos[1]; m[14]=pos[2]; m[15]=1; return m;
  },
  xfPoint(m, x, y, z){ return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]]; },
  // DirectX .x row-vector matrices (v*M) -> column-major
  fromRowMajor(a){ const m = new Float32Array(16); for(let r=0;r<4;r++) for(let c=0;c<4;c++) m[c*4+r] = a[r*4+c]; return m; },
};
E.mat = mat;

/* ---------------------------------------------------------------- readers */
class Rd {
  constructor(buf){ this.dv = new DataView(buf); this.u8 = new Uint8Array(buf); this.p = 0; }
  i4(){ const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
  f4(){ const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
  u1(){ return this.u8[this.p++]; }
  str(){ const n = this.i4(); let s = ''; for(let i=0;i<n;i++) s += String.fromCharCode(this.u8[this.p+i]); this.p += n; return s; }
  cstr(){ let s = ''; while(this.u8[this.p]) s += String.fromCharCode(this.u8[this.p++]); this.p++; return s; }
}

/* ------------------------------------------------------------------ RMesh */
// Format as read by MapSystem.bb LoadRMesh
function parseRMesh(buf){
  const r = new Rd(buf), hdr = r.str();
  if(hdr !== 'RoomMesh' && hdr !== 'RoomMesh.HasTriggerBox') throw new Error('not an RMESH: ' + hdr);
  const out = { surfaces: [], collision: [], models: [], lights: [], sounds: [], playerStart: null };
  let n = r.i4();
  for(let i=0;i<n;i++){
    const tex = [null, null];
    for(let j=0;j<2;j++){ const fl = r.u1(); if(fl) tex[j] = { flag: fl, name: r.str() }; }
    const nv = r.i4(), v = new Float32Array(nv * 10);
    for(let k=0;k<nv;k++){
      for(let q=0;q<7;q++) v[k*10+q] = r.f4();            // x y z  u0 v0  u1 v1
      v[k*10+7] = r.u1()/255; v[k*10+8] = r.u1()/255; v[k*10+9] = r.u1()/255;
    }
    const nt = r.i4(), idx = new Uint32Array(nt * 3);
    for(let k=0;k<nt*3;k++) idx[k] = r.i4();
    out.surfaces.push({ lm: tex[0], diff: tex[1], v, idx, alpha: !!(tex[1] && tex[1].flag === 3) });
  }
  n = r.i4();
  for(let i=0;i<n;i++){
    const nv = r.i4(), v = new Float32Array(nv*3); for(let k=0;k<nv*3;k++) v[k] = r.f4();
    const nt = r.i4(), idx = new Uint32Array(nt*3); for(let k=0;k<nt*3;k++) idx[k] = r.i4();
    out.collision.push({ v, idx });
  }
  if(hdr === 'RoomMesh.HasTriggerBox'){
    const ntb = r.i4();
    for(let t=0;t<ntb;t++){ const c = r.i4(); for(let i=0;i<c;i++){ const nv = r.i4(); r.p += 12*nv; const nt = r.i4(); r.p += 12*nt; } r.str(); }
  }
  const ne = r.i4();
  for(let i=0;i<ne;i++){
    const t = r.str();
    if(t === 'screen'){ r.p += 12; r.str(); }
    else if(t === 'waypoint'){ r.p += 12; }
    else if(t === 'light'){ const x=r.f4(),y=r.f4(),z=r.f4(); const range=r.f4(), col=r.str(), it=r.f4(); out.lights.push({x,y,z,range,col,it}); }
    else if(t === 'spotlight'){ const x=r.f4(),y=r.f4(),z=r.f4(); const range=r.f4(), col=r.str(), it=r.f4(); r.str(); r.i4(); r.i4(); out.lights.push({x,y,z,range,col,it}); }
    else if(t === 'soundemitter'){ const x=r.f4(),y=r.f4(),z=r.f4(); out.sounds.push({x,y,z,id:r.i4(),range:r.f4()}); }
    else if(t === 'playerstart'){ const x=r.f4(),y=r.f4(),z=r.f4(); out.playerStart = {x,y,z,ang:r.str()}; }
    else if(t === 'model'){
      const file = r.str(), pos=[r.f4(),r.f4(),r.f4()], rot=[r.f4(),r.f4(),r.f4()], sc=[r.f4(),r.f4(),r.f4()];
      out.models.push({ file, pos, rot, sc });
    } else { E.warn('rmesh: unknown entity ' + t); break; }
  }
  return out;
}

/* -------------------------------------------------------------- .x (ASCII) */
function xTokens(txt){
  const t = []; const n = txt.length; let i = 0;
  while(i < n){
    const c = txt[i];
    if(c===' '||c==='\t'||c==='\n'||c==='\r'||c===';'||c===','){ i++; continue; }
    if(c==='/' && txt[i+1]==='/' || c==='#'){ while(i<n && txt[i]!=='\n') i++; continue; }
    if(c==='{'||c==='}'){ t.push(c); i++; continue; }
    if(c==='"'){ let j = txt.indexOf('"', i+1); if(j<0) j = n; t.push({s: txt.slice(i+1, j)}); i = j+1; continue; }
    if(c==='<'){ i = txt.indexOf('>', i) + 1; if(!i) break; continue; }
    let j = i; while(j<n && !' \t\r\n;,{}"'.includes(txt[j])) j++;
    const w = txt.slice(i, j); i = j;
    const num = +w; t.push((w !== '' && !isNaN(num) && /^[-+.\d]/.test(w)) ? num : w);
  }
  return t;
}
function xParseBlocks(tok){
  let p = 0;
  function block(){      // at an identifier ... '{'
    const type = tok[p++]; let name = '';
    while(tok[p] !== '{') { name = tok[p++]; if(p >= tok.length) return null; }
    p++;
    const node = { type, name, vals: [], kids: [] };
    while(p < tok.length && tok[p] !== '}'){
      const k = tok[p];
      if(typeof k === 'number' || (typeof k === 'object')){ node.vals.push(typeof k === 'object' ? k.s : k); p++; continue; }
      if(k === '{'){ // reference: { name }
        p++; node.kids.push({ type: 'ref', name: tok[p++], vals: [], kids: [] }); p++; continue;
      }
      node.kids.push(block());
    }
    p++; return node;
  }
  const roots = [];
  while(p < tok.length){
    const k = tok[p];
    if(k === 'xof'){ p += 3; continue; }
    if(k === 'template'){ p++; while(tok[p] !== '{') p++; let d = 0; do { if(tok[p]==='{') d++; if(tok[p]==='}') d--; p++; } while(d > 0 && p < tok.length); continue; }
    if(typeof k === 'string' && k !== '{' && k !== '}'){ const b = block(); if(b) roots.push(b); } else p++;
  }
  return roots;
}
// returns [{ tex:'name'|null, color:[r,g,b,a], data: Float32Array(x y z nx ny nz u v ...)}]
// binary .x ('bin ' / 'bzip' = MSZIP-compressed): token stream -> same tokens as the text tokenizer
function xBinTokens(u8){
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const t = []; let p = 0; const n = u8.length;
  while(p + 2 <= n){
    const k = dv.getUint16(p, true); p += 2;
    if(k === 1){ const l = dv.getUint32(p, true); p += 4; t.push(new TextDecoder('latin1').decode(u8.subarray(p, p+l))); p += l; }
    else if(k === 2){ const l = dv.getUint32(p, true); p += 4; t.push({ s: new TextDecoder('latin1').decode(u8.subarray(p, p+l)) }); p += l + 2; }
    else if(k === 3){ t.push(dv.getUint32(p, true)); p += 4; }
    else if(k === 5){ p += 16; }
    else if(k === 6){ const c = dv.getUint32(p, true); p += 4; for(let i=0;i<c;i++){ t.push(dv.getUint32(p, true)); p += 4; } }
    else if(k === 7){ const c = dv.getUint32(p, true); p += 4; for(let i=0;i<c;i++){ t.push(dv.getFloat32(p, true)); p += 4; } }
    else if(k === 10) t.push('{'); else if(k === 11) t.push('}');
    else if(k === 31) t.push('template');
    else if(k === 12 || k === 13 || k === 14 || k === 15 || k === 16 || k === 17 || k === 18 || k === 19 || k === 20 || (k >= 40 && k <= 52)) { /* punctuation / type keywords */ }
    else { E.warn('xbin: unknown token ' + k); break; }
  }
  return t;
}
async function inflateRaw(u8){
  const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function parseX(buf){
  const u8 = new Uint8Array(buf); const magic = new TextDecoder('latin1').decode(u8.subarray(0, 16));
  if(!magic.startsWith('xof ')) throw new Error('not a DirectX .x file');
  const fmt = magic.slice(8, 12); let tokens;
  if(fmt === 'txt ') tokens = xTokens(new TextDecoder('latin1').decode(u8));
  else if(fmt === 'bin ') tokens = xBinTokens(u8.subarray(16));
  else if(fmt === 'bzip'){
    const parts = []; let p = 20, total = 0;
    const dv = new DataView(buf);
    while(p + 6 <= u8.length){ const un = dv.getUint16(p, true), cs = dv.getUint16(p+2, true); parts.push(await inflateRaw(u8.subarray(p+6, p+4+cs))); total += un; p += 4 + cs; }
    if(parts.length > 1) E.warn('xbzip: multi-chunk MSZIP not supported');
    tokens = xBinTokens(parts[0]);
  } else throw new Error('unsupported .x format ' + fmt);
  const roots = xParseBlocks(tokens);
  const mats = {}; const groups = new Map();
  const collectMat = nd => { if(nd.type === 'Material') mats[nd.name] = nd; nd.kids.forEach(k => k && collectMat(k)); };
  roots.forEach(collectMat);
  const matInfo = m => {
    if(!m) return { tex: null, color: [1,1,1,1] };
    if(m.type === 'ref') m = mats[m.name] || m;
    const tf = m.kids.find(k => k && k.type === 'TextureFilename');
    const v = m.vals;
    return { tex: tf && tf.vals[0] ? String(tf.vals[0]) : null, color: [v[0]??1, v[1]??1, v[2]??1, v[3]??1] };
  };
  function frame(nd, parent){
    let M = parent;
    const ft = nd.kids.find(k => k && k.type === 'FrameTransformMatrix');
    if(ft && ft.vals.length >= 16) M = mat.mul(parent, mat.fromRowMajor(ft.vals));      // child applied first
    for(const k of nd.kids){
      if(!k) continue;
      if(k.type === 'Frame') frame(k, M);
      else if(k.type === 'Mesh') mesh(k, M);
    }
  }
  function mesh(nd, M){
    const v = nd.vals; let p = 0; const nv = v[p++]; const P = [];
    for(let i=0;i<nv;i++){ P.push([v[p++], v[p++], v[p++]]); }
    const nf = v[p++]; const faces = [];
    for(let i=0;i<nf;i++){ const c = v[p++]; const f = []; for(let k=0;k<c;k++) f.push(v[p++]); faces.push(f); }
    let uv = null, nrm = null, nrmFaces = null, fmat = null; const matList = [];
    for(const k of nd.kids){
      if(!k) continue;
      if(k.type === 'MeshTextureCoords'){ uv = []; const n = k.vals[0]; for(let i=0;i<n;i++) uv.push([k.vals[1+i*2], k.vals[2+i*2]]); }
      else if(k.type === 'MeshNormals'){
        const n = k.vals[0]; nrm = []; for(let i=0;i<n;i++) nrm.push([k.vals[1+i*3], k.vals[2+i*3], k.vals[3+i*3]]);
        let q = 1 + n*3; const nfn = k.vals[q++]; nrmFaces = []; for(let i=0;i<nfn;i++){ const c = k.vals[q++]; const f = []; for(let z=0;z<c;z++) f.push(k.vals[q++]); nrmFaces.push(f); }
      }
      else if(k.type === 'MeshMaterialList'){
        const nm = k.vals[0], nfi = k.vals[1]; fmat = []; for(let i=0;i<nfi;i++) fmat.push(k.vals[2+i]);
        k.kids.forEach(m => m && matList.push(matInfo(m)));
      }
    }
    if(!matList.length) matList.push({ tex: null, color: [1,1,1,1] });
    const nM = new Float32Array([M[0],M[1],M[2],0, M[4],M[5],M[6],0, M[8],M[9],M[10],0, 0,0,0,1]);
    const world = P.map(q => mat.xfPoint(M, q[0], q[1], q[2]));
    for(let fi=0; fi<faces.length; fi++){
      const f = faces[fi]; const mi = fmat ? (fmat[fi] ?? 0) : 0; const mt = matList[mi] || matList[0];
      const key = (mt.tex || '') + '|' + mt.color.join(',');
      let g = groups.get(key); if(!g){ g = { tex: mt.tex, color: mt.color, data: [] }; groups.set(key, g); }
      for(let k=1;k<f.length-1;k++){
        const tri = [f[0], f[k], f[k+1]];
        const a = world[tri[0]], b = world[tri[1]], c = world[tri[2]];
        // geometric normal (Blitz winding is clockwise => flip the cross product)
        const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], wx=c[0]-a[0], wy=c[1]-a[1], wz=c[2]-a[2];
        let gx = uy*wz-uz*wy, gy = uz*wx-ux*wz, gz = ux*wy-uy*wx; const gl = Math.hypot(gx,gy,gz)||1; gx/=gl; gy/=gl; gz/=gl;
        for(const vi of tri){
          const w = world[vi]; let nx = -gx, ny = -gy, nz = -gz;
          if(nrm && nrm.length === nv){ const o = nrm[vi]; nx = M[0]*o[0]+M[4]*o[1]+M[8]*o[2]; ny = M[1]*o[0]+M[5]*o[1]+M[9]*o[2]; nz = M[2]*o[0]+M[6]*o[1]+M[10]*o[2]; const l = Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l; }
          const t = uv && uv[vi] ? uv[vi] : [0,0];
          g.data.push(w[0], w[1], w[2], nx, ny, nz, t[0], t[1]);
        }
      }
    }
  }
  roots.forEach(r => { if(r.type === 'Frame') frame(r, mat.ident()); else if(r.type === 'Mesh') mesh(r, mat.ident()); });
  return [...groups.values()].map(g => ({ tex: g.tex, color: g.color, data: new Float32Array(g.data) }));
}

/* ------------------------------------------------------------------- .b3d */
function parseB3D(buf){
  const r = new Rd(buf); const texs = [], brushes = []; const groups = new Map();
  function chunkHdr(){ const tag = String.fromCharCode(r.u1(), r.u1(), r.u1(), r.u1()); const len = r.i4(); return { tag, end: r.p + len }; }
  const top = chunkHdr(); if(top.tag !== 'BB3D') throw new Error('not a B3D');
  r.i4();   // version
  function nodeM(pos, sc, q){
    const [w,x,y,z] = q; const xx=x*x, yy=y*y, zz=z*z, xy=x*y, xz=x*z, yz=y*z, wx=w*x, wy=w*y, wz=w*z;
    const R = [1-2*(yy+zz), 2*(xy+wz), 2*(xz-wy),   2*(xy-wz), 1-2*(xx+zz), 2*(yz+wx),   2*(xz+wy), 2*(yz-wx), 1-2*(xx+yy)]; // columns
    const m = new Float32Array(16);
    for(let c=0;c<3;c++){ m[c*4]=R[c*3]*sc[c]; m[c*4+1]=R[c*3+1]*sc[c]; m[c*4+2]=R[c*3+2]*sc[c]; }
    m[12]=pos[0]; m[13]=pos[1]; m[14]=pos[2]; m[15]=1; return m;
  }
  function node(end, parent){
    const name = r.cstr(); const pos = [r.f4(), r.f4(), r.f4()], sc = [r.f4(), r.f4(), r.f4()], q = [r.f4(), r.f4(), r.f4(), r.f4()];
    const M = mat.mul(parent, nodeM(pos, sc, q));
    let verts = null, vflags = 0, tcs = 0, tcsz = 2, meshBrush = -1;
    while(r.p < end){
      const c = chunkHdr();
      if(c.tag === 'NODE') node(c.end, M);
      else if(c.tag === 'MESH'){
        meshBrush = r.i4(); verts = null;
        while(r.p < c.end){
          const d = chunkHdr();
          if(d.tag === 'VRTS'){
            vflags = r.i4(); tcs = r.i4(); tcsz = r.i4(); verts = [];
            while(r.p < d.end){
              const p = [r.f4(), r.f4(), r.f4()]; let n = [0,1,0], u = 0, v = 0;
              if(vflags & 1) n = [r.f4(), r.f4(), r.f4()];
              if(vflags & 2) r.p += 16;
              for(let s=0;s<tcs;s++) for(let k=0;k<tcsz;k++){ const f = r.f4(); if(s===0){ if(k===0) u = f; else if(k===1) v = f; } }
              verts.push({ p, n, u, v });
            }
          } else if(d.tag === 'TRIS'){
            let bid = r.i4(); if(bid < 0) bid = meshBrush;
            const br = brushes[bid] || { tex: -1, color: [1,1,1,1] };
            const tname = br.tex >= 0 && texs[br.tex] ? texs[br.tex] : null;
            const key = (tname || '') + '|' + br.color.join(',');
            let g = groups.get(key); if(!g){ g = { tex: tname, color: br.color, data: [] }; groups.set(key, g); }
            while(r.p < d.end){
              for(const vi of [r.i4(), r.i4(), r.i4()]){
                const V = verts[vi]; const w = mat.xfPoint(M, V.p[0], V.p[1], V.p[2]);
                let nx = M[0]*V.n[0]+M[4]*V.n[1]+M[8]*V.n[2], ny = M[1]*V.n[0]+M[5]*V.n[1]+M[9]*V.n[2], nz = M[2]*V.n[0]+M[6]*V.n[1]+M[10]*V.n[2];
                const l = Math.hypot(nx,ny,nz)||1;
                g.data.push(w[0], w[1], w[2], nx/l, ny/l, nz/l, V.u, V.v);
              }
            }
          }
          r.p = d.end;
        }
      }
      r.p = c.end;
    }
  }
  while(r.p < top.end){
    const c = chunkHdr();
    if(c.tag === 'TEXS'){ while(r.p < c.end){ texs.push(r.cstr()); r.p += 28; } }
    else if(c.tag === 'BRUS'){
      const nt = r.i4();
      while(r.p < c.end){ r.cstr(); const col = [r.f4(), r.f4(), r.f4(), r.f4()]; r.f4(); r.i4(); r.i4(); const ids = []; for(let i=0;i<nt;i++) ids.push(r.i4()); brushes.push({ tex: ids[0] ?? -1, color: col }); }
    }
    else if(c.tag === 'NODE') node(c.end, mat.ident());
    r.p = c.end;
  }
  return [...groups.values()].map(g => ({ tex: g.tex, color: g.color, data: new Float32Array(g.data) }));
}

/* ----------------------------------------------------------------- WebGL */
let gl = null, cv = null;
const VS_ROOM = `#version 300 es
in vec3 aPos; in vec2 aUV0; in vec2 aUV1; in vec3 aCol;
uniform mat4 uVP; out vec2 vUV0; out vec2 vUV1; out vec3 vCol; out float vDepth;
void main(){ vec4 p = uVP*vec4(aPos,1.0); gl_Position = p; vUV0 = aUV0; vUV1 = aUV1; vCol = aCol; vDepth = p.w; }`;
const FS_ROOM = `#version 300 es
precision highp float;
in vec2 vUV0; in vec2 vUV1; in vec3 vCol; in float vDepth;
uniform sampler2D uDiff; uniform sampler2D uLm; uniform float uK; uniform float uAlpha; uniform vec2 uFog;
out vec4 o;
void main(){
  vec4 d = texture(uDiff, vUV0); vec3 l = texture(uLm, vUV1).rgb;
  vec3 c = d.rgb * l * uK * vCol;
  float f = clamp((uFog.y - vDepth) / (uFog.y - uFog.x), 0.0, 1.0);
  o = vec4(c * f, d.a * uAlpha);
}`;
const VS_OBJ = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aUV;
uniform mat4 uVP; uniform mat4 uModel; out vec2 vUV; out vec3 vN; out float vDepth;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vec4 p = uVP*w; gl_Position = p; vUV = aUV; vN = mat3(uModel)*aNrm; vDepth = p.w; }`;
const FS_OBJ = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vN; in float vDepth;
uniform sampler2D uTex; uniform vec4 uTint; uniform float uAmb; uniform float uDir; uniform vec2 uFog; uniform float uFull;
out vec4 o;
void main(){
  vec4 t = texture(uTex, vUV); if(t.a < 0.5) discard;
  vec3 n = normalize(vN);
  float l = mix(uAmb + uDir*(0.55 + 0.45*n.y), 1.0, uFull);
  float f = clamp((uFog.y - vDepth) / (uFog.y - uFog.x), 0.0, 1.0);
  o = vec4(t.rgb * uTint.rgb * l * f, 1.0);
}`;
const VS_FS = `#version 300 es
out vec2 vUV; void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUV = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
const FS_POST = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uScene; uniform sampler2D uPrev; uniform float uBlur; uniform float uDark; uniform float uRoll; uniform float uScale; uniform float uAsp;
out vec4 o;
void main(){
  vec2 c = vUV - 0.5; c.x *= uAsp; float s = sin(uRoll), k = cos(uRoll);
  c = vec2(k*c.x - s*c.y, s*c.x + k*c.y) / uScale; c.x /= uAsp; vec2 uv = c + 0.5;
  vec3 a = (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) ? vec3(0.0) : texture(uScene, uv).rgb;
  vec3 b = texture(uPrev, vUV).rgb;
  o = vec4(mix(a*(1.0-uDark), b, uBlur), 1.0);   // Dark sprite is part of the scene; blur sprite (EntityOrder -100000) is drawn over it
}`;
const FS_BLIT = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform float uDark; uniform float uGamma; out vec4 o;
void main(){ vec3 c = texture(uTex, vUV).rgb; c = pow(c, vec3(uGamma)); o = vec4(c * (1.0 - uDark), 1.0); }`;

function prog(vs, fs){
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

const texCache = new Map(); let whiteTex = null, aniso = null;
function makeTex(src, clamp){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const w = clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
  if(aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  return t;
}
// resolve a texture name the way Blitz does (relative to the model's folder), with .jpg/.png fallbacks
function resolveTexPath(name, dirs){
  const n = name.replace(/\\/g, '/');
  const base = n.split('/').pop();
  for(const d of dirs){
    const J = x => d ? d + '/' + x : x;
    for(const cand of [J(n), J(base), J(n.replace(/\.[^.]+$/, '.jpg')), J(n.replace(/\.[^.]+$/, '.png'))]) if(E.has(cand)) return cand;
  }
  return null;
}
E.getTexture = async (name, dirs, clamp) => {
  if(!name) return whiteTex;
  const path = resolveTexPath(name, dirs); if(!path){ E.warn('texture not found: ' + name); return whiteTex; }
  const key = keyOf(path) + (clamp ? '#c' : '');
  if(texCache.has(key)) return texCache.get(key);
  const pr = (async () => {
    try{
      const b = await getBuf(path);
      const bmp = await createImageBitmap(new Blob([b]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      return makeTex(bmp, clamp);
    }catch(e){ E.warn('texture failed ' + path + ': ' + e.message); return whiteTex; }
  })();
  texCache.set(key, pr); return pr;
};

function buildVAO(attribs, data, stride){
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  attribs.forEach(([loc, size, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride*4, off*4); });
  gl.bindVertexArray(null); return vao;
}

/* ----------------------------------------------------------- world model */
// Collision: triangle soup in world space, grid in x/z. Player ellipsoid is scaled into a sphere.
const CELL = 0.5;
class TriWorld {
  constructor(){ this.tris = []; this.surf = []; this.grid = new Map(); this.stamp = null; this.cur = 0; }
  add(ax,ay,az,bx,by,bz,cx,cy,cz,surf){ this.tris.push(ax,ay,az,bx,by,bz,cx,cy,cz); this.surf.push(surf); }
  build(){
    this.T = new Float32Array(this.tris); this.S = Int16Array.from(this.surf); const n = this.S.length;
    this.stamp = new Uint32Array(n); this.cur = 0;
    const T = this.T;
    for(let i=0;i<n;i++){
      const o = i*9; const x0 = Math.min(T[o],T[o+3],T[o+6]), x1 = Math.max(T[o],T[o+3],T[o+6]), z0 = Math.min(T[o+2],T[o+5],T[o+8]), z1 = Math.max(T[o+2],T[o+5],T[o+8]);
      for(let cx = Math.floor(x0/CELL); cx <= Math.floor(x1/CELL); cx++) for(let cz = Math.floor(z0/CELL); cz <= Math.floor(z1/CELL); cz++){
        const k = cx*65536 + cz; let a = this.grid.get(k); if(!a){ a = []; this.grid.set(k, a); } a.push(i);
      }
    }
    this.tris = null; this.surf = null;
  }
  // gather unique triangle ids overlapping the box
  query(x0,z0,x1,z1,out){
    out.length = 0; this.cur++;
    for(let cx = Math.floor(x0/CELL); cx <= Math.floor(x1/CELL); cx++) for(let cz = Math.floor(z0/CELL); cz <= Math.floor(z1/CELL); cz++){
      const a = this.grid.get(cx*65536 + cz); if(!a) continue;
      for(let i=0;i<a.length;i++){ const t = a[i]; if(this.stamp[t] !== this.cur){ this.stamp[t] = this.cur; out.push(t); } }
    }
    return out;
  }
}
function closestOnTri(px,py,pz, ax,ay,az, bx,by,bz, cx,cy,cz, o){
  // Ericson, Real-Time Collision Detection
  const abx=bx-ax, aby=by-ay, abz=bz-az, acx=cx-ax, acy=cy-ay, acz=cz-az;
  const apx=px-ax, apy=py-ay, apz=pz-az;
  const d1 = abx*apx+aby*apy+abz*apz, d2 = acx*apx+acy*apy+acz*apz;
  if(d1<=0 && d2<=0){ o[0]=ax; o[1]=ay; o[2]=az; return; }
  const bpx=px-bx, bpy=py-by, bpz=pz-bz; const d3 = abx*bpx+aby*bpy+abz*bpz, d4 = acx*bpx+acy*bpy+acz*bpz;
  if(d3>=0 && d4<=d3){ o[0]=bx; o[1]=by; o[2]=bz; return; }
  const vc = d1*d4 - d3*d2;
  if(vc<=0 && d1>=0 && d3<=0){ const v = d1/(d1-d3); o[0]=ax+v*abx; o[1]=ay+v*aby; o[2]=az+v*abz; return; }
  const cpx=px-cx, cpy=py-cy, cpz=pz-cz; const d5 = abx*cpx+aby*cpy+abz*cpz, d6 = acx*cpx+acy*cpy+acz*cpz;
  if(d6>=0 && d5<=d6){ o[0]=cx; o[1]=cy; o[2]=cz; return; }
  const vb = d5*d2 - d1*d6;
  if(vb<=0 && d2>=0 && d6<=0){ const w = d2/(d2-d6); o[0]=ax+w*acx; o[1]=ay+w*acy; o[2]=az+w*acz; return; }
  const va = d3*d6 - d5*d4;
  if(va<=0 && (d4-d3)>=0 && (d5-d6)>=0){ const w = (d4-d3)/((d4-d3)+(d5-d6)); o[0]=bx+w*(cx-bx); o[1]=by+w*(cy-by); o[2]=bz+w*(cz-bz); return; }
  const den = 1/(va+vb+vc), v = vb*den, w = vc*den; o[0]=ax+abx*v+acx*w; o[1]=ay+aby*v+acy*w; o[2]=az+abz*v+acz*w;
}

E.world = null;
E.boxes = [];            // dynamic AABB colliders (doors, filler walls): {x0,y0,z0,x1,y1,z1,on}
E.addBox = (x0,y0,z0,x1,y1,z1) => { const b = {x0,y0,z0,x1,y1,z1,on:true}; E.boxes.push(b); return b; };
const tmpQ = [], cp = [0,0,0];
// Move an ellipsoid (radius rx on x/z, ry on y — Blitz: EntityRadius Collider, 0.15, 0.30) with sliding response.
E.moveCollider = (pos, dx, dy, dz, rx = 0.15, ry = 0.30) => {
  const W = E.world; if(!W) { pos[0]+=dx; pos[1]+=dy; pos[2]+=dz; return { floor: false }; }
  const ys = rx/ry, T = W.T; let floor = false;
  let x = pos[0], y = pos[1]*ys, z = pos[2];
  const len = Math.hypot(dx, dy*ys, dz), steps = Math.max(1, Math.ceil(len/0.04));
  const sx = dx/steps, sy = dy*ys/steps, sz = dz/steps;
  for(let s=0;s<steps;s++){
    x += sx; y += sy; z += sz;
    for(let it=0; it<4; it++){
      let pushed = false;
      W.query(x-rx, z-rx, x+rx, z+rx, tmpQ);
      for(let q=0;q<tmpQ.length;q++){
        const o = tmpQ[q]*9;
        closestOnTri(x,y,z, T[o],T[o+1]*ys,T[o+2], T[o+3],T[o+4]*ys,T[o+5], T[o+6],T[o+7]*ys,T[o+8], cp);
        const vx = x-cp[0], vy = y-cp[1], vz = z-cp[2], d2 = vx*vx+vy*vy+vz*vz;
        if(d2 < rx*rx){
          const d = Math.sqrt(d2); let nx, ny, nz;
          if(d > 1e-6){ nx=vx/d; ny=vy/d; nz=vz/d; }
          else { const ux=T[o+3]-T[o], uy=(T[o+4]-T[o+1])*ys, uz=T[o+5]-T[o+2], wx=T[o+6]-T[o], wy=(T[o+7]-T[o+1])*ys, wz=T[o+8]-T[o+2]; nx=uy*wz-uz*wy; ny=uz*wx-ux*wz; nz=ux*wy-uy*wx; const l = Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l; }
          const push = rx - d + 1e-4; x += nx*push; y += ny*push; z += nz*push; pushed = true;
          if(ny > 0.55) floor = true;
        }
      }
      for(const b of E.boxes){
        if(!b.on) continue;
        const by0 = b.y0*ys, by1 = b.y1*ys;
        const qx = Math.max(b.x0, Math.min(x, b.x1)), qy = Math.max(by0, Math.min(y, by1)), qz = Math.max(b.z0, Math.min(z, b.z1));
        const vx = x-qx, vy = y-qy, vz = z-qz, d2 = vx*vx+vy*vy+vz*vz;
        if(d2 >= rx*rx) continue;
        if(d2 > 1e-10){ const d = Math.sqrt(d2), push = rx-d+1e-4; x += vx/d*push; y += vy/d*push; z += vz/d*push; }
        else { // centre inside the box: leave through the nearest x/z face
          const c = [[x-b.x0+rx,-1,0],[b.x1-x+rx,1,0],[z-b.z0+rx,0,-1],[b.z1-z+rx,0,1]].sort((p,q)=>p[0]-q[0])[0];
          x += c[1]*c[0]; z += c[2]*c[0];
        }
        pushed = true;
      }
      if(!pushed) break;
    }
  }
  pos[0] = x; pos[1] = y/ys; pos[2] = z; return { floor };
};
// highest walkable surface at/below (x,y,z); returns {y, surf} or null
E.groundAt = (x, y, z, maxDrop = 4) => {
  const W = E.world; if(!W) return null; const T = W.T; let best = -1e9, bs = -1;
  W.query(x-0.01, z-0.01, x+0.01, z+0.01, tmpQ);
  for(let q=0;q<tmpQ.length;q++){
    const i = tmpQ[q], o = i*9;
    const ax=T[o], ay=T[o+1], az=T[o+2], bx=T[o+3], by=T[o+4], bz=T[o+5], cx=T[o+6], cy=T[o+7], cz=T[o+8];
    const den = (bz-cz)*(ax-cx) + (cx-bx)*(az-cz); if(Math.abs(den) < 1e-9) continue;
    const l1 = ((bz-cz)*(x-cx) + (cx-bx)*(z-cz))/den, l2 = ((cz-az)*(x-cx) + (ax-cx)*(z-cz))/den, l3 = 1-l1-l2;
    if(l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
    const h = l1*ay + l2*by + l3*cy;
    if(h <= y + 0.05 && h >= y - maxDrop && h > best){ best = h; bs = W.S[i]; }
  }
  return best > -1e8 ? { y: best, surf: bs } : null;
};
// Is the segment a->b free of geometry? (Möller–Trumbore against nearby triangles)
E.segClear = (ax, ay, az, bx, by, bz) => {
  const W = E.world; if(!W) return true; const T = W.T;
  const dx = bx-ax, dy = by-ay, dz = bz-az, L = Math.hypot(dx,dy,dz); if(L < 1e-4) return true;
  W.query(Math.min(ax,bx)-0.05, Math.min(az,bz)-0.05, Math.max(ax,bx)+0.05, Math.max(az,bz)+0.05, tmpQ);
  for(let q=0;q<tmpQ.length;q++){
    const o = tmpQ[q]*9; const e1x=T[o+3]-T[o], e1y=T[o+4]-T[o+1], e1z=T[o+5]-T[o+2], e2x=T[o+6]-T[o], e2y=T[o+7]-T[o+1], e2z=T[o+8]-T[o+2];
    const px = dy*e2z-dz*e2y, py = dz*e2x-dx*e2z, pz = dx*e2y-dy*e2x; const det = e1x*px+e1y*py+e1z*pz; if(Math.abs(det) < 1e-9) continue;
    const id = 1/det, tx = ax-T[o], ty = ay-T[o+1], tz = az-T[o+2]; const u = (tx*px+ty*py+tz*pz)*id; if(u < 0 || u > 1) continue;
    const qx = ty*e1z-tz*e1y, qy = tz*e1x-tx*e1z, qz = tx*e1y-ty*e1x; const v = (dx*qx+dy*qy+dz*qz)*id; if(v < 0 || u+v > 1) continue;
    const t = (e2x*qx+e2y*qy+e2z*qz)*id; if(t > 0.001 && t < 0.999) return false;
  }
  for(const b of E.boxes){            // slab test against the dynamic boxes
    if(!b.on) continue;
    let t0 = 0, t1 = 1, ok = true;
    for(const [o, d, lo, hi] of [[ax,dx,b.x0,b.x1],[ay,dy,b.y0,b.y1],[az,dz,b.z0,b.z1]]){
      if(Math.abs(d) < 1e-9){ if(o < lo || o > hi){ ok = false; break; } }
      else { let u = (lo-o)/d, v = (hi-o)/d; if(u > v){ const w = u; u = v; v = w; } t0 = Math.max(t0, u); t1 = Math.min(t1, v); if(t0 > t1){ ok = false; break; } }
    }
    if(ok && t0 < 0.999 && t1 > 0.001) return false;
  }
  return true;
};

/* --------------------------------------------------------------- init/GL */
let progRoom, progObj, progPost, progBlit, sceneFBO, accFBO = [], accTex = [], sceneTex, depthRB, curAcc = 0, fsVAO, RW = 0, RH = 0;
function makeFBO(w, h, withDepth){
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rb = null;
  if(withDepth){ rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); }
  return { fb, tex, rb };
}
E.resize = (w, h) => {
  w = Math.max(16, w|0); h = Math.max(16, h|0); if(w === RW && h === RH) return; RW = w; RH = h; cv.width = w; cv.height = h;
  if(sceneFBO){ gl.deleteFramebuffer(sceneFBO.fb); gl.deleteTexture(sceneFBO.tex); gl.deleteRenderbuffer(sceneFBO.rb); accFBO.forEach(a => { gl.deleteFramebuffer(a.fb); gl.deleteTexture(a.tex); }); }
  sceneFBO = makeFBO(w, h, true); accFBO = [makeFBO(w, h, false), makeFBO(w, h, false)];
  for(const a of accFBO){ gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); }
};
E.init = (canvas) => {
  cv = canvas; gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if(!gl) throw new Error('WebGL2 is not available in this browser');
  aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  progRoom = prog(VS_ROOM, FS_ROOM); progObj = prog(VS_OBJ, FS_OBJ); progPost = prog(VS_FS, FS_POST); progBlit = prog(VS_FS, FS_BLIT);
  fsVAO = gl.createVertexArray();
  whiteTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, whiteTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  E.resize(cv.clientWidth || 960, cv.clientHeight || 540);
};
E.front = 'CW';        // Blitz front faces are clockwise

/* -------------------------------------------------------- loading models */
const modelCache = new Map();
// returns { parts:[{vao,count,tex,color}], bbox }
E.loadModel = (path, dirs) => {
  const key = keyOf(path); if(modelCache.has(key)) return modelCache.get(key);
  const pr = (async () => {
    const buf = await getBuf(path);
    const groups = path.toLowerCase().endsWith('.b3d') ? parseB3D(buf) : await parseX(buf);
    const parts = []; const bb = [1e9,1e9,1e9,-1e9,-1e9,-1e9];
    const base = path.replace(/\\/g,'/').split('/').slice(0,-1).join('/');
    for(const g of groups){
      const tex = await E.getTexture(g.tex, [base, ...dirs]);
      const d = g.data; for(let i=0;i<d.length;i+=8){ for(let a=0;a<3;a++){ bb[a] = Math.min(bb[a], d[i+a]); bb[a+3] = Math.max(bb[a+3], d[i+a]); } }
      parts.push({ vao: buildVAO([[0,3,0],[1,3,3],[2,2,6]], d, 8), count: d.length/8, tex, color: g.color, data: d });
    }
    return { parts, bbox: bb };
  })();
  modelCache.set(key, pr); return pr;
};

// Axis-aligned textured box (origin bottom-centre) as a model: {parts:[{vao,count,tex,color,data}], bbox}
E.boxModel = async (w, h, d, texName, dirs, uvPerMeter = 0.5) => {
  const hx = w/2, hz = d/2, data = [];
  const faces = [ // outward normal, 4 corners, uv extents
    [[0,0,1],  [[-hx,0,hz],[hx,0,hz],[hx,h,hz],[-hx,h,hz]], w, h],
    [[0,0,-1], [[hx,0,-hz],[-hx,0,-hz],[-hx,h,-hz],[hx,h,-hz]], w, h],
    [[1,0,0],  [[hx,0,hz],[hx,0,-hz],[hx,h,-hz],[hx,h,hz]], d, h],
    [[-1,0,0], [[-hx,0,-hz],[-hx,0,hz],[-hx,h,hz],[-hx,h,-hz]], d, h],
    [[0,1,0],  [[-hx,h,hz],[hx,h,hz],[hx,h,-hz],[-hx,h,-hz]], w, d],
    [[0,-1,0], [[-hx,0,-hz],[hx,0,-hz],[hx,0,hz],[-hx,0,hz]], w, d]];
  for(const [n, q, su, sv] of faces){
    const uv = [[0,sv*uvPerMeter],[su*uvPerMeter,sv*uvPerMeter],[su*uvPerMeter,0],[0,0]];
    for(const tri of [[0,1,2],[0,2,3]]){
      let t = tri.map(i => q[i]), u = tri.map(i => uv[i]);
      const e1 = [t[1][0]-t[0][0], t[1][1]-t[0][1], t[1][2]-t[0][2]], e2 = [t[2][0]-t[0][0], t[2][1]-t[0][1], t[2][2]-t[0][2]];
      const c = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
      if(c[0]*n[0]+c[1]*n[1]+c[2]*n[2] > 0){ t = [t[0],t[2],t[1]]; u = [u[0],u[2],u[1]]; }   // Blitz front faces are clockwise: cross points inward
      for(let k=0;k<3;k++) data.push(t[k][0],t[k][1],t[k][2], n[0],n[1],n[2], u[k][0],u[k][1]);
    }
  }
  const d32 = new Float32Array(data), tex = await E.getTexture(texName, dirs);
  return { parts: [{ vao: buildVAO([[0,3,0],[1,3,3],[2,2,6]], d32, 8), count: d32.length/8, tex, color: [1,1,1,1], data: d32 }], bbox: [-hx,0,-hz,hx,h,hz] };
};

/* ------------------------------------------------------------- the room */
// opts: {x,z (metres, room origin), yaw (deg, Blitz RotateEntity), into: room object to merge into (shares one collision world), defer}
E.loadRoom = async (path, opts = {}) => {
  const rm = parseRMesh(await getBuf(path)); const S = E.RoomScale;
  const dirs = ['GFX/map'];
  const room = opts.into || { opaque: [], alpha: [], props: [], lights: [], sounds: [], bbox: [1e9,1e9,1e9,-1e9,-1e9,-1e9] };
  const W = room.W || (room.W = new TriWorld()); const surfNames = room.surfNames || (room.surfNames = []);
  const ox = opts.x || 0, oz = opts.z || 0, ya = (opts.yaw || 0)*RAD, ys_ = Math.sin(ya), yc_ = Math.cos(ya);
  // local (x,z) -> world: x' = x cos - z sin, z' = x sin + z cos (Blitz yaw+ turns left), then translate
  const TX = (x,z) => ox + x*yc_ - z*ys_, TZ = (x,z) => oz + x*ys_ + z*yc_;
  for(const s of rm.surfaces){
    const diffName = s.diff && s.diff.name ? s.diff.name : null, lmName = s.lm && s.lm.name ? s.lm.name : null;
    const [dt, lt] = await Promise.all([E.getTexture(diffName, dirs), E.getTexture(lmName, dirs, true)]);
    const v = new Float32Array(s.v); for(let i=0;i<v.length;i+=10){ const lx = v[i]*S, lz = v[i+2]*S; v[i] = TX(lx,lz); v[i+1]*=S; v[i+2] = TZ(lx,lz); for(let a=0;a<3;a++){ room.bbox[a]=Math.min(room.bbox[a],v[i+a]); room.bbox[a+3]=Math.max(room.bbox[a+3],v[i+a]); } }
    // expand indexed -> non-indexed is unnecessary; keep an index buffer
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    [[0,3,0],[1,2,3],[2,2,5],[3,3,7]].forEach(([l,sz,o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 40, o*4); });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, s.idx, gl.STATIC_DRAW); gl.bindVertexArray(null);
    const surf = { vao, count: s.idx.length, dt, lt, k: (lmName && !diffName) ? 1.0 : 2.0, name: (diffName || '').toLowerCase() };
    const sid = surfNames.push(surf.name) - 1;
    (s.alpha ? room.alpha : room.opaque).push(surf);
    if(!s.alpha) for(let i=0;i<s.idx.length;i+=3){ const a = s.idx[i]*10, b = s.idx[i+1]*10, c = s.idx[i+2]*10; W.add(v[a],v[a+1],v[a+2], v[b],v[b+1],v[b+2], v[c],v[c+1],v[c+2], sid); }
  }
  for(const c of rm.collision){
    const sid = surfNames.push('') - 1; const v = c.v; const P = (i) => [TX(v[i]*S, v[i+2]*S), v[i+1]*S, TZ(v[i]*S, v[i+2]*S)];
    for(let i=0;i<c.idx.length;i+=3){ const A = P(c.idx[i]*3), B = P(c.idx[i+1]*3), C = P(c.idx[i+2]*3); W.add(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], sid); }
  }
  // props (monitors, lamps, chairs, ...) are room entities: world = S * (pos + R*(scale*v))
  const propSid = surfNames.push('') - 1;
  for(const m of rm.models){
    if(!m.file) continue;
    let mdl; try{ mdl = await E.loadModel('GFX/Map/Props/' + m.file, ['GFX/map']); }catch(e){ E.warn('prop failed ' + m.file + ': ' + e.message); continue; }
    const M = mat.mul(mat.trs([ox,0,oz], opts.yaw || 0,0,0, [S,S,S]), mat.trs(m.pos, m.rot[1], m.rot[0], m.rot[2], m.sc));
    room.props.push({ mdl, M, full: /lamp/i.test(m.file) });
    for(const p of mdl.parts){
      const d = p.data;
      for(let i=0;i<d.length;i+=24){
        const A = mat.xfPoint(M, d[i],d[i+1],d[i+2]), B = mat.xfPoint(M, d[i+8],d[i+9],d[i+10]), C = mat.xfPoint(M, d[i+16],d[i+17],d[i+18]);
        W.add(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], propSid);
      }
    }
  }
  for(const l of rm.lights){ const c = l.col.split(' ').map(Number); const it = Math.min(l.it*0.8, 1); room.lights.push({ x:TX(l.x*S,l.z*S), y:l.y*S, z:TZ(l.x*S,l.z*S), intensity: ((c[0]+c[1]+c[2])*it/255/3) }); }
  for(const s of rm.sounds) room.sounds.push({ x:TX(s.x*S,s.z*S), y:s.y*S, z:TZ(s.x*S,s.z*S), id:s.id, range:s.range });
  if(!room.raw) room.raw = rm;
  if(!opts.defer) E.finishRoom(room);
  return room;
};
E.finishRoom = (room) => { room.W.build(); E.world = room.W; E.surfNames = room.surfNames; };
// step sound class from the surface texture name (Data/materials.ini: stepsound = 1 -> metal)
E.materials = {};
E.loadMaterials = async (path) => {
  const t = new TextDecoder().decode(await getBuf(path)); let cur = null;
  for(const line of t.split(/\r?\n/)){ const s = line.trim(); const m = s.match(/^\[(.+)\]$/); if(m){ cur = m[1].toLowerCase(); E.materials[cur] = 0; } else if(cur){ const k = s.match(/^stepsound\s*=\s*(\d+)/i); if(k) E.materials[cur] = +k[1]; } }
};
E.stepClass = (surfId) => { const n = E.surfNames && E.surfNames[surfId]; return (n && E.materials[n]) ? E.materials[n] : 0; };

/* ----------------------------------------------------------------- draw */
E.camera = { pos:[0,0,0], yaw:0, pitch:0, fovy: 73.74, near: 0.05, far: 15, fog:[0.5, 6], zoom: 1 };
E.drawList = [];      // dynamic objects: {mdl, M, amb, dir, tint}
E.post = { roll: 0, scale: 1, blur: 0, dark: 0, gamma: 1 };
function viewProj(c, asp){
  const yaw = c.yaw*RAD, p = c.pitch*RAD, sy=Math.sin(yaw), cy=Math.cos(yaw), sp=Math.sin(p), cp2=Math.cos(p);
  const f = [-sy*cp2, -sp, cy*cp2];
  let r = [cy, 0, sy], u = [-sp*sy, cp2, sp*cy];
  if(c.roll){ const q = c.roll*RAD, sr = Math.sin(q), cr = Math.cos(q);   // Blitz roll: camera right tilts toward up
    const r2 = [r[0]*cr+u[0]*sr, r[1]*cr+u[1]*sr, r[2]*cr+u[2]*sr], u2 = [-r[0]*sr+u[0]*cr, -r[1]*sr+u[1]*cr, -r[2]*sr+u[2]*cr]; r = r2; u = u2; }
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const v = new Float32Array(16);
  v[0]=r[0]; v[4]=r[1]; v[8]=r[2]; v[12]=-dot(r,c.pos);
  v[1]=u[0]; v[5]=u[1]; v[9]=u[2]; v[13]=-dot(u,c.pos);
  v[2]=-f[0]; v[6]=-f[1]; v[10]=-f[2]; v[14]=dot(f,c.pos); v[15]=1;
  const fov = 2*Math.atan(Math.tan(c.fovy*RAD/2)/c.zoom);
  return mat.mul(mat.persp(fov, asp, c.near, c.far), v);
}
E.render = (room) => {
  const c = E.camera, asp = RW/RH, VP = viewProj(c, asp);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb); gl.viewport(0, 0, RW, RH);
  gl.clearColor(0,0,0,1); gl.clearDepth(1); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(E.front === 'CW' ? gl.CW : gl.CCW);
  if(room){
    gl.useProgram(progRoom.p); gl.uniformMatrix4fv(progRoom.u.uVP, false, VP); gl.uniform2fv(progRoom.u.uFog, c.fog);
    gl.uniform1i(progRoom.u.uDiff, 0); gl.uniform1i(progRoom.u.uLm, 1); gl.uniform1f(progRoom.u.uAlpha, 1);
    for(const s of room.opaque){
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.dt); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.lt);
      gl.uniform1f(progRoom.u.uK, s.k); gl.bindVertexArray(s.vao); gl.drawElements(gl.TRIANGLES, s.count, gl.UNSIGNED_INT, 0);
    }
    // props + dynamic objects
    gl.useProgram(progObj.p); gl.uniformMatrix4fv(progObj.u.uVP, false, VP); gl.uniform2fv(progObj.u.uFog, c.fog); gl.uniform1i(progObj.u.uTex, 0); gl.activeTexture(gl.TEXTURE0);
    const drawM = (mdl, M, amb, dir, full, tint) => {
      gl.uniformMatrix4fv(progObj.u.uModel, false, M); gl.uniform1f(progObj.u.uAmb, amb); gl.uniform1f(progObj.u.uDir, dir); gl.uniform1f(progObj.u.uFull, full ? 1 : 0);
      for(const p of mdl.parts){
        gl.bindTexture(gl.TEXTURE_2D, p.tex); const t = tint || [1,1,1]; gl.uniform4f(progObj.u.uTint, p.color[0]*t[0], p.color[1]*t[1], p.color[2]*t[2], 1);
        gl.bindVertexArray(p.vao); gl.drawArrays(gl.TRIANGLES, 0, p.count);
      }
    };
    for(const p of room.props) drawM(p.mdl, p.M, 0.42, 0.30, p.full);
    for(const o of E.drawList) drawM(o.mdl, o.M, o.amb ?? 0.55, o.dir ?? 0.45, false, o.tint);
    // glass
    gl.useProgram(progRoom.p); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.uniform1f(progRoom.u.uAlpha, 0.55);
    for(const s of room.alpha){
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.dt); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, whiteTex);
      gl.uniform1f(progRoom.u.uK, 1.0); gl.bindVertexArray(s.vao); gl.drawElements(gl.TRIANGLES, s.count, gl.UNSIGNED_INT, 0);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  // post: scene (+roll) blended with the previous frame (BlurVolume) into accumulation buffer
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(fsVAO);
  const prev = accFBO[curAcc ^ 1], cur = accFBO[curAcc];
  gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb); gl.viewport(0,0,RW,RH);
  gl.useProgram(progPost.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev.tex);
  gl.uniform1i(progPost.u.uScene, 0); gl.uniform1i(progPost.u.uPrev, 1); gl.uniform1f(progPost.u.uBlur, E.post.blur); gl.uniform1f(progPost.u.uDark, E.post.dark); gl.uniform1f(progPost.u.uRoll, E.post.roll*RAD); gl.uniform1f(progPost.u.uScale, E.post.scale); gl.uniform1f(progPost.u.uAsp, asp);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0,0,RW,RH);
  gl.useProgram(progBlit.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(progBlit.u.uTex, 0); gl.uniform1f(progBlit.u.uDark, 0); gl.uniform1f(progBlit.u.uGamma, E.post.gamma);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  curAcc ^= 1;
};
E.gl = () => gl;

/* ------------------------------------------------------------------ audio */
const A = { ctx: null, master: null, buf: new Map(), dec: new Map() };
E.audio = A;
A.init = () => {
  if(A.ctx) return A.ctx;
  try{ A.ctx = new (window.AudioContext || window.webkitAudioContext)(); A.master = A.ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(A.ctx.destination); }catch(e){ A.ctx = null; }
  return A.ctx;
};
A.load = async (path) => {
  const k = keyOf(path); if(A.buf.has(k)) return A.buf.get(k);
  const pr = (async () => {
    try{ const b = await getBuf(path); const d = await A.ctx.decodeAudioData(b); A.dec.set(k, d); return d; }
    catch(e){ E.warn('audio failed ' + path + ': ' + e.message); return null; }
  })();
  A.buf.set(k, pr); return pr;
};
A.loadAll = async (paths) => { if(!A.init()) return; await Promise.all(paths.map(p => A.load(p))); };
A.ready = path => A.dec.get(keyOf(path)) || null;
// play(path, {vol, rate, loop, pan}) -> {gain, src, stop()}; returns null if the sample is unavailable
A.play = (path, o = {}) => {
  if(!A.ctx) return null; const b = A.dec.get(keyOf(path)); if(!b) return null;
  const src = A.ctx.createBufferSource(); src.buffer = b; src.loop = !!o.loop; src.playbackRate.value = o.rate || 1;
  const g = A.ctx.createGain(); g.gain.value = o.vol ?? 1; let last = g;
  if(o.pan !== undefined && A.ctx.createStereoPanner){ const pn = A.ctx.createStereoPanner(); pn.pan.value = o.pan; g.connect(pn); last = pn; src.__pan = pn; }
  src.connect(g); last.connect(A.master); src.start();
  const h = { gain: g, src, playing: true, stop(){ try{ src.stop(); }catch(_){} } };
  src.onended = () => { h.playing = false; };
  return h;
};
return E;
})();
