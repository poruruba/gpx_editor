'use strict';

//const vConsole = new VConsole();
//const remoteConsole = new RemoteConsole("http://[remote server]/logio-post");
//window.datgui = new dat.GUI();

let target_marker;
let map;
let gpx;

const empty_gpx = 
`<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
<trk><name>track</name><number>1</number><trkseg>
</trkseg>
</trk>
</gpx>`;

var vue_options = {
    el: "#top",
    mixins: [mixins_bootstrap],
    store: vue_store,
    data: {
        line: [],
        target_index: 0,
        target_lat: 0,
        target_lng: 0,
        target_ele: 0,
        target_time: "",
        current_mode: "idle",
        table_index: -1,
        image_lat: 0.0,
        image_lng: 0.0,
        image_source: null,
        default_lat: 35.40,
        default_lng: 136.0,
    },
    computed: {
    },
    methods: {
        image_select_start: function(){
            this.image_lat = 0.0;
            this.image_lng = 0.0;
            this.image_source = null;
            this.dialog_open('#image_select_dialog');
        },
        image_exif_select: function(){
            if( this.image_lat == 0.0 || this.image_lng == 0x0 )
                return;

            this.target_set_point(this.image_lat, this.image_lng);
            map.setView([this.target_lat, this.target_lng], 14);
            this.dialog_close('#image_select_dialog');
        },
        gpx_new_or_open: function(){
            this.dialog_open('#file_select_dialog');
        },
        gpx_new_file: async function(){
            await this.gpx_new();
            this.dialog_close('#file_select_dialog');
        },
        gpx_new: async function(){
            if( gpx )
                gpx.clearLayers();
            await this.line_load(empty_gpx);
        },
        gpx_save: async function(){
            var gpx_data = await this.line_export();
            file_save(gpx_data, "application/gpx+xml", "new_gpx.xml");
            if( this.line.length > 0){
                localStorage.setItem('default_lat', this.line[0].lat);
                localStorage.setItem('default_lng', this.line[0].lng);
            }
        },
        gpx_open_files: function(files){
            if( files.length > 0 ){
                const reader = new FileReader()
                reader.addEventListener("load", async () => {
                    if( gpx )
                        gpx.clearLayers();
                    await this.line_load(reader.result);
                    this.dialog_close('#file_select_dialog');
                }, false);
                reader.readAsText(files[0]);
            }
        },
        image_open_files: function(files){
            if( files.length > 0 ){
                const reader = new FileReader()
                reader.addEventListener("load", async () => {
                    var image = await imageLoad(reader.result);
                    var exif = await get_exif(image);
                    if( !exif ){
                        alert('EXIF情報がありませんでした。');
                        return;
                    }
                    this.image_source = reader.result;
                    this.image_lat = exif.lat;
                    this.image_lng = exif.lng;
                }, false);
                reader.readAsDataURL(files[0]);
            }
        },
        target_new: function(){
            this.table_index = -1;
            for( let item of this.line)
                item.selected = false;

            var latlng = map.getCenter();
            this.target_set_point(latlng.lat, latlng.lng);
            this.target_time = tim2datetime(new Date().getTime());
            this.target_ele = 0;
            
            this.mode_change("add");
        },
        target_add: async function(){
            var item = {
                lat: this.target_lat,
                lng: this.target_lng,
                meta: {
                    time: new Date(this.target_time),
                    ele: this.target_ele
                }
            };
            if(this.current_mode == 'add')
                this.line.push(item);
            else if( this.current_mode == 'modify')
                this.line[this.target_index] = item;

            await this.line_reload();
        },
        target_cancel: function(){
            this.mode_change('view');
        },
        mode_change: function(mode){
            this.current_mode = mode;
            switch(mode){
                case "idle":{
                    target_marker.setRadius(0);
                    break;
                }
                case "add": {
                    target_marker.setRadius(10);
                    break;
                }
                case "modify": {
                    target_marker.setRadius(10);
                    break;
                }
                case "view": {
                    target_marker.setRadius(0);
                    break;
                }
            }
        },
        point_selecting: function(e){
//            console.log(e);
            map.setView([this.line[this.table_index].lat, this.line[this.table_index].lng]);
            this.point_selected();
        },
        point_selected: function(){
            this.target_set_point(this.line[this.table_index].lat, this.line[this.table_index].lng);
            this.target_index = this.table_index;
            this.target_time = tim2datetime(this.line[this.table_index].meta.time.getTime());
            this.target_ele = parseInt(this.line[this.table_index].meta.ele, 10);

            for( let item of this.line)
                item.selected = false;
            this.line[this.table_index].selected = true;
        },
        point_modify: function(index){
            map.setView([this.line[index].lat, this.line[index].lng]);
            this.target_set_point(this.line[index].lat, this.line[index].lng);
            this.target_index = index;
            this.target_time = tim2datetime(this.line[index].meta.time.getTime());
            this.target_ele = parseInt(this.line[index].meta.ele, 10),
            target_marker.setLatLng([this.target_lat, this.target_lng]);
            this.mode_change("modify");
        },
        point_remove: async function(index){
            this.line.splice(index, 1);
            await this.line_reload();
        },
        line_load: async function(gpx_data){
            this.line = [];
            this.table_index = -1;

            this.gpx_json = JSON.parse(xml2json(gpx_data, {compact: true}));
            return new Promise((resolve, reject) =>{
                gpx = new L.GPX(gpx_data, {
                    async: true,
                    marker_options: {
                        startIconUrl: 'img/pin-icon-start.png',
                        endIconUrl: 'img/pin-icon-end.png',
                        shadowUrl: 'img/pin-shadow.png',
                    },
                    polyline_options: {
                        color: 'blue',
                        opacity: 0.75,
                        weight: 5,
                        lineCap: 'round'
                    }
                }).on('loaded', (e) => {
                    if( this.current_mode == 'idle' || this.current_mode == 'view')
                        map.fitBounds(e.target.getBounds());
                    this.mode_change("view");
                    return resolve();
                }).on('addpoint', (e) => {
//                    console.log(e.point);
                }).on('addline', (e) => {
//                    console.log(e);
                    this.line = e.line.getLatLngs();
//                    console.log(this.line);
                }).on('click', (e) =>{
//                    console.log(e);
                    var index = this.search_point(e.latlng.lat, e.latlng.lng);
                    if( index >= 0 ){
                        this.table_index = index;
                        this.point_selected();
                    }
                }).on('error', (e) =>{
//                    console.error(e);
                    return resolve();
                }).addTo(map);
            });
        },
        line_reload: async function(){
            await this.line_sort();
            var gpx_data = await this.line_export();
            gpx.clearLayers();

            return this.line_load(gpx_data);
        },
        line_sort: function(){
            this.line.sort((first, second) =>{
                var first_time = new Date(first);
                var second_time = new Date(second);
                if( first_time < second_time ) return -1;
                else if(first_time > second_time ) return 1;
                return 0;
            });
        },
        line_export: function(){
            this.gpx_json.gpx.trk.trkseg.trkpt = [];
            for( var i = 0 ; i < this.line.length ; i++ ){
                var item = {
                    "_attributes": {
                        lat: this.line[i].lat,
                        lon: this.line[i].lng
                    },
                    "ele": {
                        "_text": String(this.line[i].meta.ele)
                    },
                    "time": {
                        "_text": this.line[i].meta.time.toISOString()
                    },
                }
                this.gpx_json.gpx.trk.trkseg.trkpt.push(item);   
            }
//            console.log(JSON.stringify(this.gpx_json));

            return json2xml(this.gpx_json, {compact: true});
        },
        search_point: function(lat, lng){
            var min_distance = Number.MAX_SAFE_INTEGER;
            var index = -1;
            for( var i = 0 ; i < this.line.length ; i++ ){
                var distance = calc_distance({ lat: lat, lng: lng }, { lat: this.line[i].lat, lng: this.line[i].lng } );
                if( distance < min_distance ){
                    index = i;
                    min_distance = distance;
                }
            }

            return index;
        },
        target_set_point: function(lat, lng){
            this.target_lat = lat;
            this.target_lng = lng;
            target_marker.setLatLng([this.target_lat, this.target_lng]);
            target_marker.setRadius(10);
        },
    },
    created: function(){
    },
    mounted: async function(){
        proc_load();

        this.default_lat = localStorage.getItem('default_lat') || this.default_lat;
        this.default_lng = localStorage.getItem('default_lng') || this.default_lng;

        map = L.map('mapcontainer', {
            zoomControl: true,
        }).on('click', (e) =>{
//            console.log(e);
            if( this.current_mode == 'add' || this.current_mode == 'modify'){
                this.target_set_point(e.latlng.lat, e.latlng.lng);
            }
        });
        map.setView([this.default_lat, this.default_lng], 10);

        L.control.scale({
            imperial: false
        }).addTo(map);

        target_marker = L.circleMarker([this.default_lat, this.default_lng], { radius: 0 }).addTo(map);
        
        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
            attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank' rel='noopener noreferrer'>地理院タイル</a>"
        }).addTo(map);

        await this.gpx_new();
    }
};
vue_add_data(vue_options, { progress_title: '' }); // for progress-dialog
vue_add_global_components(components_bootstrap);
vue_add_global_components(components_utils);

/* add additional components */
  
window.vue = new Vue( vue_options );

const R = Math.PI / 180;

function calc_distance(point1, point2) {
  let lat1 = point1.lat * R;
  let lng1 = point1.lng * R;
  let lat2 = point2.lat * R;
  let lng2 = point2.lng * R;
  return 6371 * Math.acos(Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1) + Math.sin(lat1) * Math.sin(lat2));
}

function tim2datetime(tim){
    function to2d(d){
        return ("00" + d).slice(-2);
    }
    var date = new Date(tim);
    return date.getFullYear() + "-" + to2d(date.getMonth() + 1) + "-" + to2d(date.getDate()) + "T" + to2d(date.getHours()) + ":" + to2d(date.getMinutes()) + ":" + to2d(date.getSeconds());
}

async function imageLoad(url){
    return new Promise((resolve, reject) =>{
        const image = new Image()
        image.src = url
        image.onload = function () {
            return resolve(image);
        };
        image.onerror = function(){
            return reject(null);
        };
    });
}

async function get_exif(image){
    return new Promise((resolve, reject) =>{
        EXIF.getData(image, function () {
            const gpsLatitude = EXIF.getTag(image, 'GPSLatitude')
            const gpgLongitude = EXIF.getTag(image, 'GPSLongitude')
            if( !gpsLatitude || !gpgLongitude )
                return resolve(null);
            const lat = gpsLatitude[0]/1 + gpsLatitude[1]/60 + gpsLatitude[2]/3600
            const lon = gpgLongitude[0]/1 + gpgLongitude[1]/60 + gpgLongitude[2]/3600
            return resolve({ lat: lat, lng: lon });
        });
    });
}

function file_save(text, mime_type, fname){
    var blob = new Blob([text], { type: mime_type });
    var url = window.URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.target = '_blank';
    a.download = fname || "new_title.txt" ;
    a.click();
    window.URL.revokeObjectURL(url);
}
