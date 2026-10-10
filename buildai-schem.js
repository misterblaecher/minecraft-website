/* Browser-only Sponge Schematic v3 writer for GabCon Studio Web.
 * Matches mcbuild.export.schem layout: root Schematic, Blocks.Palette/Data,
 * X-fastest varint block order, Minecraft 1.21.1 DataVersion 3955.
 */
'use strict';
window.GabConSchem = (() => {
  const encode = new TextEncoder();
  class Writer {
    constructor(capacity) {
      this.buffer=new ArrayBuffer(capacity);
      this.view=new DataView(this.buffer);
      this.position=0;
    }
    byte(n){this.view.setUint8(this.position++,n&255);}
    short(n){this.view.setInt16(this.position,n,false);this.position+=2;}
    int(n){this.view.setInt32(this.position,n,false);this.position+=4;}
    string(value){
      const bytes=encode.encode(value);
      if(bytes.length>65535)throw Error('Nom NBT trop long.');
      this.short(bytes.length);
      new Uint8Array(this.buffer,this.position,bytes.length).set(bytes);
      this.position+=bytes.length;
    }
    tag(type,name){this.byte(type);this.string(name);}
    end(){this.byte(0);}
    varint(v){
      do{
        let octet=v&127;
        v>>>=7;
        if(v)octet|=128;
        this.byte(octet);
      }while(v);
    }
    finish(){return new Uint8Array(this.buffer,0,this.position);}
  }

  async function encodeSchem(grid){
    if(!grid || !Array.isArray(grid.blocks) || !grid.blocks.length)throw Error('Aucun bloc à exporter.');
    if(typeof CompressionStream!=='function')throw Error('Export .schem non pris en charge par ce navigateur : CompressionStream (gzip) manquant.');
    const [width,height,length]=grid.dims.map(Number);
    const volume=width*height*length;
    if(!Number.isSafeInteger(volume)||volume>3000000)throw Error('Volume trop grand pour le navigateur.');
    if([width,height,length].some(n=>!Number.isInteger(n)||n<=0||n>512))throw Error('Dimensions .schem invalides.');
    const palette=[...grid.palette];
    let airIndex=palette.indexOf('minecraft:air');
    if(airIndex<0){airIndex=palette.length;palette.push('minecraft:air');}
    const dense=new Uint32Array(volume);
    dense.fill(airIndex);
    for(const entry of grid.blocks){
      const [x,y,z,idx]=entry;
      if(x<0||y<0||z<0||x>=width||y>=height||z>=length||idx<0||idx>=palette.length){
        throw Error('Coordonnées de blocs invalides.');
      }
      dense[x+z*width+y*width*length]=idx;
    }
    const namesSize=palette.reduce((n,s)=>n+encode.encode(s).length+10,0);
    const output=new Writer(volume*5+namesSize+4096);
    output.tag(10,''); // unnamed compound root
    output.tag(10,'Schematic');
    output.tag(3,'Version');output.int(3);
    output.tag(3,'DataVersion');output.int(3955);
    output.tag(2,'Width');output.short(width);
    output.tag(2,'Height');output.short(height);
    output.tag(2,'Length');output.short(length);
    output.tag(11,'Offset');output.int(3);
    for(const v of grid.bounds[0])output.int(v);
    output.tag(10,'Blocks');
    output.tag(10,'Palette');
    palette.forEach((block,index)=>{
      output.tag(3,block);
      output.int(index);
    });
    output.end(); // Palette
    output.tag(7,'Data');
    const lengthPosition=output.position;
    output.int(0);
    const start=output.position;
    for(const index of dense)output.varint(index);
    output.view.setInt32(lengthPosition,output.position-start,false);
    output.tag(9,'BlockEntities');output.byte(10);output.int(0);
    output.end(); // Blocks
    output.tag(9,'Entities');output.byte(10);output.int(0);
    output.end(); // Schematic
    output.end(); // Root
    const stream=new Blob([output.finish()]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).blob();
  }
  return {encodeSchem};
})();
