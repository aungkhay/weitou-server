var CryptoJS = require('crypto-js');

var crypt = module.exports;
/*
     * aes加密解密
     * 加密setAesString
     * 解密getAesString
*/
crypt.setAesString = function(data,G_KP){
        var key = CryptoJS.enc.Utf8.parse(G_KP.key),
            iv = CryptoJS.enc.Utf8.parse(G_KP.iv),
            encrypted = CryptoJS.AES.encrypt(data, key,{
                iv:iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
        return encrypted.toString();
},
crypt.getAesString = function(data,G_KP){
        var key = CryptoJS.enc.Utf8.parse(G_KP.key),
            iv = CryptoJS.enc.Utf8.parse(G_KP.iv),
            decrypted = CryptoJS.AES.decrypt(data, key,{
                iv:iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
        return decrypted.toString(CryptoJS.enc.Utf8);
},
/**
  * 密码加盐  @hn_account
*/
crypt.getCltPwdSalt=function(str){
        str = str + "$hn";
        str = str + "$easy";
        str = str + "$hn";
        str = str + "$easy";
        str = str + "$account";
        str = sha512(str);
        str = this.get16Arr(str);
        str = this.base64encode(str);
        return str;
 },

 crypt.get16Arr=function(str){
        var pos = 0, len, i, binary = '', hexA = new Array();
        str = '0000' + str;
        len = str.length;
        if(len %2 != 0) return null;
        len /= 2;
        for(i = 0; i < len; i++){
            var s = str.substr(pos, 2);
            var v = parseInt(s, 16);
            hexA.push(v);
            pos += 2;
        }
        var bytes = new Uint8Array(hexA);
        len = bytes.byteLength;
        for (i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return binary;
},
crypt.base64encode =function (str) {
        var out, i, len;
        var c1, c2, c3;
        var base64EncodeChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        len = str.length;
        i = 0;
        out = "";
        while(i < len) {
        c1 = str.charCodeAt(i++) & 0xff;
        if(i == len)
        {
            out += base64EncodeChars.charAt(c1 >> 2);
            out += base64EncodeChars.charAt((c1 & 0x3) << 4);
            out += "==";
            break;
        }
        c2 = str.charCodeAt(i++);
        if(i == len)
        {
            out += base64EncodeChars.charAt(c1 >> 2);
            out += base64EncodeChars.charAt(((c1 & 0x3)<< 4) | ((c2 & 0xF0) >> 4));
            out += base64EncodeChars.charAt((c2 & 0xF) << 2);
            out += "=";
            break;
        }
        c3 = str.charCodeAt(i++);
        out += base64EncodeChars.charAt(c1 >> 2);
        out += base64EncodeChars.charAt(((c1 & 0x3)<< 4) | ((c2 & 0xF0) >> 4));
        out += base64EncodeChars.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >>6));
        out += base64EncodeChars.charAt(c3 & 0x3F);
        }
        return out;
},
crypt.dataURLtoBlob=function(dataurl) {
        var bstr = atob(dataurl),
        n = bstr.length,
        u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {
            type: ""
        });
}
