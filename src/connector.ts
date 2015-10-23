var Carbon;
(function (Carbon) {
    var Connector = (function () {
        function Connector(name, type) {
            this.defer = $.Deferred();
            this.name = name;
            this.type = type;
            this.defer.promise(this);
        }
        Connector.prototype.start = function () {
            var popup = new PopupWindow('/' + this.type, {
                title: "Connecting " + this.name + " to Carbonmade",
                width: 800,
                height: 600
            });
            popup.on('closed', this.onDone.bind(this));
            popup.open();
        };
        Connector.prototype.save = function (accessToken) {
            var ajax = $.ajax("/" + this.type + "/update", {
                method: 'POST',
                data: { accessToken: accessToken }
            });
            return ajax;
        };
        Connector.prototype.onDone = function () {
            var _this = this;
            $.get("/networks/" + this.type + "/status")
                .then(function (result) {
                if (result.user) {
                    _this.defer.resolve(result);
                }
                else {
                    _this.defer.reject(result);
                }
            });
        };
        return Connector;
    })();
    Carbon.Connector = Connector;
    var PopupWindow = (function () {
        function PopupWindow(url, options) {
            if (options === void 0) { options = {}; }
            this.url = url;
            this.options = options || {};
            this.width = this.options.width || 800;
            this.height = this.options.height || 600;
            this.top = (screen.height / 2) - (this.height / 2);
            this.left = (screen.width / 2) - (this.width / 2);
        }
        PopupWindow.prototype.on = function (name, callback) {
            if (callback === undefined) {
                $(this).on(name);
            }
            else {
                $(this).on(name, callback);
            }
        };
        PopupWindow.prototype.open = function () {
            var _this = this;
            var params = 'location=0,status=0,width=800,height=600,top=' + this.top + ',left=' + this.left;
            var popup = window.open(this.url, this.options.title || 'Popup', params);
            this.interval = setInterval(function () {
                if (popup.closed) {
                    clearInterval(_this.interval);
                    $(_this).triggerHandler('closed');
                }
            }, 100);
        };
        return PopupWindow;
    })();
})(Carbon || (Carbon = {}));
function parseQuery(text, seperator) {
    var query = {};
    var parts = text.split('&');
    for (var i = 0; i < parts.length; i++) {
        var keyValue = parts[i].split('=');
        query[decodeURIComponent(keyValue[0])] = decodeURIComponent(keyValue[1]);
    }
    return query;
}
