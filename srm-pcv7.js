var util = require("util");
var sys = require("sys");
var serialport = require("serialport");
var SerialPort = serialport.SerialPort; // localize object constructor


var Queue = function () {
  this.queue = []
}
Queue.prototype.add = function(obj, wait_len, found_fn) {
  // obj should by { data: data, ofs: 0, len: len }
//console.log('ADD:'+JSON.stringify(obj))
  if (obj) {
    if (obj.length == 0) { return }
//    obj.offset = 0;
    this.queue.push({ data: obj, ofs: 0})
  }
  if (wait_len == 0) {
    found_fn(new Buffer(0), "")
    return
  }
  var segs = 0
  var need = wait_len
  for (var i = 0; i < this.queue.length; ++i) {
    var qe = this.queue[i];
    var diff = qe.data.length - qe.ofs;
    ++segs;
//console.log('PROC qlen='+qe.data.length+" qofs="+qe.ofs+" diff="+diff+" need="+need+":"+util.inspect(qe))
    if (diff >= need) {
      var buffer = new Buffer(wait_len)
      var buffer_ofs = 0
      for (var i = 0; i < segs-1; ++i) {
        /* all but last */
        qe = this.queue.shift()
        qe.data.copy(buffer, buffer_ofs, qe.ofs);
        buffer_ofs += qe.data.length - qe.ofs
//console.log('TOTAL');
        delete qe
      }
      qe = this.queue[0]
      qe.data.copy(buffer, buffer_ofs, qe.ofs, qe.ofs+need);
//console.log('PARTIAL', qe.data.length, qe.ofs, need, util.inspect(buffer), util.inspect(qe));
      if (qe.ofs+need == qe.data.length) {
//console.log('DELETE')
        delete this.queue.shift() 
      }
      else { this.queue[0].ofs += need }
      found_fn(buffer, qe['test'] && qe.test)
      break
    }
    need -= diff
  }
}
      
/*
      baudrate: Baud Rate, defaults to 9600. Must be one of: 115200, 57600, 38400, 19200, 9600, 4800, 2400, 1800, 1200, 600, 300, 200, 150, 134, 110, 75, or 50.
      databits: Data Bits, defaults to 8. Must be one of: 8, 7, 6, or 5.
      stopbits: Stop Bits, defaults to 1. Must be one of: 1 or 2.
      parity: Parity, defaults to 0. Must be one of: 0, 1, or 2.
      buffersize: Size of read buffer, defaults to 255. Must be an integer value.
      parser: The parser engine to use with read data, defaults to rawPacket strategy which just emits the raw buffer as a "data" event. Can be any function that accepts EventEmitter as first parameter and the raw buffer as the second parameter.o
var baud =[115200, 57600, 38400, 19200, 9600, 4800, 2400, 1800, 1200, 600, 300, 200, 150, 134, 110, 75, 50]
*/
function pc7() {

  // 0xA4 0xB0 0x00 0x03 0x01 0x01 0x16
  var msg_init =  { code: [0x01, 0x01, 0x16] };
  var seq = [msg_init]
  // DEVICE PAGES
  //var msg_device_page = [0x02, 0x00, 0x15]
  //send:<Buffer a4 b0 00 03 02 05 15> Name Reqest
  //recv:<Buffer a4 b0 00 17 02 05 4d 65 6e 6f 00 00 00 00> Name Response
  /*
  for(var i = 1; i < 0x12; ++i) {
    var out = []
    for(var j in msg_device_page) { out.push(msg_device_page[j]) }
    out[1] = i;
    seq.push(out);
  }
  */

  // UNKNOWN PAGES
  get_memory_content_length = { code: [0x04, 0x01, 0x13],
    handler: function(data) {
console.log('get_memory_content_length:'+util.inspect(data));
    }
  }
  seq.push(get_memory_content_length)
/*
  msg_unknown_continue = [0x04, 0x02, 0x13]
  seq.push(msg_unknown_continue)
  seq.push(msg_unknown_continue)
  seq.push(msg_unknown_continue)
  seq.push(msg_unknown_continue)
  seq.push(msg_unknown_continue)
  seq.push(msg_unknown_continue)
  //seq.push(msg_unknown_start)
  //seq.push(msg_unknown_continue)
  msg_unknown_bulk = [0x04, 0x04, 0x13]
  seq.push(msg_unknown_bulk)
  //send:<Buffer a4 b0 00 03 02 05 15> Name Reqest
  //recv:<Buffer a4 b0 00 17 02 05 4d 65 6e 6f 00 00 00 00> Name Response
*/





/*
  var state = get_header;

  var sequencer = function (data) {
    a = new Buffer(data.length);
    data.copy(a);
//console.log('-6-', util.inspect(a), state.wait_len);
    var dequeue = function(state) { 
      if (!state) { return }
      queue.add(a, state.wait_len, function(data) { 
  console.log('-6-:'+util.inspect(data));
        dequeue(state.fn(data, current_seq))
      })
    }
    dequeue(state);
  });
  sp.on("data", );
  */



  Transaction = function(action) {
    var queue = new Queue();
    this.sp = new SerialPort('/dev/ttyUSB0', {
      parser: serialport.parsers.raw,
      baudrate: 38400,
      databits: 8,
      stopbits: 1,
      parity: 0
    });
    var self = this;
    this.step = 0;
    var state = self.states[self.states.steps[self.step++]];
    var executor = function(data) { 
      state.fn.apply(self, [data])
      if (self.step >= self.states.steps.length)  { self.step = 0; }
      state = self.states[self.states.steps[self.step++]];
      queue.add(null, state.wait_len, executor)
    }
    this.sp.on("data", function(data) {
//console.log('<<recv:'+util.inspect(data));
      queue.add(data, state.wait_len, executor)
    })
  }
  Transaction.prototype.states = {
    steps: ['getHeader', 'getLength', 'getData'],
    getData: { wait_len: -1, 
                fn: function(data) {
//console.log('get_data:'+data.length+":"+util.inspect(data));
                  this.action.response(data);
                  //send(current_seq);
                  //return get_header;
                }
              },
    getLength: { wait_len: 2, 
                  fn: function(data) {
                    this.states.getData.wait_len = (data[0] << 8) | data[1]
              //console.log('get_length:'+get_data.wait_len)
                    //return get_data 
                  }
                },
    getHeader: { wait_len: 2, 
                 fn: function(data) {
                   if (data[0] == 0xA4 && data[1] == 0xB0) {
                     //return get_length;
                   } else {
                     sys.puts('HEADER-ERROR:'+util.inspect(data))
                     return null;
                   }
                 }
               }
  }
  Transaction.prototype.run = function(action) {
    //this.state = this.states.getHeader
    this.action = action;
    this.send(action.request());
  }
  Transaction.prototype.send = function(msg) {
      if (!msg) { return; }
      out = new Buffer(msg.length + 4);
      out[0] = 0xA4;
      out[1] = 0xB0;
      out[2] = (msg.length&0xff00) >> 8;
      out[3] = (msg.length&0xff);
      for(var i = 0; i < msg.length; ++i) { out[4+i] = msg[i]; }
//sys.puts(">>send:"+util.inspect(out));
      this.sp.write(out);
  }
  Transaction.prototype.padding = function(i, p) {
    var o = 10
    for(var j = 0; j < p-1; ++j) { o *= 10 }
    return (''+(i+o)).slice(1)
  }
  Transaction.prototype.printDate = function(data, ofs) {
    return data[ofs] + '-'+ this.padding(data[ofs+1],2) + "-" + (data[ofs+2]<<8 | data[ofs+3]) + " " + data[ofs+4]+":"+this.padding(data[ofs+5], 2)+":"+this.padding(data[ofs+6],2)
  }

  var trans = new Transaction();

  trans.run({
    request: function() {
      return [0x01, 0x01, 0x16];
    },
    response: function(data) {
      console.log('PONG'+util.inspect(data))
      trans.run({
        request: function() { return [0x04, 0x01, 0x13] },
        response: function(data) { 
          var sets = (data[2]<<8 | data[3]);
          console.log('MEM'+util.inspect(data)+":"+sets)
          var read_mem = {
            request: function() { return [0x04, 0x02, 0x13] },
            response: function(data) { 
              //04 02 00 0a 1d 03 07 db 0f 26 04 03 e8 4d 65 6e 6f
              var set = (data[2]<<8 | data[3]);
              console.log('DATA:'+set+":"+trans.printDate(data, 4)+":"+(data[43]<<8|data[44])+":"+util.inspect(data)+":"+sets)
              var count = (data[43]<<8|data[44]);
              bulk_mem = {
                  request: function() { return [0x04, 0x04, 0x13] },
                  response: function(data) {
                    console.log('BULK:'+count+":"+set+":"+util.inspect(data)+":"+data.length)
                    count -= 16;
                    if (count > 0) {
                      trans.run(bulk_mem);
                    } else {
                      if (set != sets) {
                        trans.run(read_mem); 
                      }
                    }
                  }
              }
              trans.run(bulk_mem);
              return 
              //}
              //trans.run(read_mem);
            }
          }
          trans.run(read_mem); 
        },
      })
    }
  })

}

pc7();

