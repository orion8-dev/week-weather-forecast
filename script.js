// Global objects and cache for popup data
let map, weatherToday_widget;
const todayPopupCache = {};

// Toast handling (unchanged)
const toastTrigger = document.getElementById('liveToastBtn');
const toastLive = document.getElementById('liveToast');
if (toastTrigger) {
    const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toastLive);
    toastTrigger.addEventListener('click', () => toastBootstrap.show());
}

const loadingElement = document.querySelector('.loading');
loadingElement.classList.remove('visually-hidden');
loadingElement.classList.add('visually-show');


// Helper: Calculate today's and 7-days later dates
function from_to_date() {
    const today = new Date();
    const formattedToday = today.toISOString().slice(0, 10).replace(/-/g, '');
    today.setDate(today.getDate() + 7);
    const sevenDaysLater = today.toISOString().slice(0, 10).replace(/-/g, '');
    return [formattedToday, sevenDaysLater];
}

// Helper: Convert date strings based on type
function convertDate(forecastDate, type) {
    if (!forecastDate) return '';
    if (type === 'week') {
        const date = new Date(forecastDate);
        if (isNaN(date)) throw new Error('無効な日付形式です。');
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const dayOfWeek = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(date);
        return `${month}/${day}日（${dayOfWeek}）`;
    } else if (type === 'today') {
        const year = parseInt(forecastDate.slice(0, 4), 10);
        const month = parseInt(forecastDate.slice(4, 6), 10) - 1;
        const day = parseInt(forecastDate.slice(6, 8), 10);
        const date = new Date(year, month, day);
        const dayOfWeek = date.toLocaleDateString('ja-JP', { weekday: 'short' });
        return `${day}日（${dayOfWeek}）`;
    }
    return forecastDate;
}

// Helper: Create weather popup HTML
function createTodayPopupHTML(data, area_name) {
    const weatherCodeMap = {
        0: '資料無し',
        1: '100',
        2: '200',
        3: '300',
        4: '303',
        5: '400'
    };
    const forecastTypeMap = {
        "01": "予報",
        "02": "現況",
        "03": "過去"
    };

    const weather_code_str = weatherCodeMap[data.weather.code] || '不明';
    const forecast_type_str = forecastTypeMap[data.type] || '不明';
    const formattedForcastDate = convertDate(data.datetime, 'today');


    return `
        <table>
            <tr><td><strong>${area_name}${forecast_type_str}</strong></td></tr>
            <tr><td><img src="https://www.jma.go.jp/bosai/forecast/img/${weather_code_str}.svg" class="today_img" alt="${data.weather.text}"></td></tr>
            <tr><td><strong>${data.weather.text}</strong></td></tr>
            <tr><td>${formattedForcastDate}</td></tr>
            <tr><td><b>気温</b> ${data.temperature.value}℃</td></tr>
        </table>
    `;
}

// Wrap the API call in a Promise to use async/await
function fetchTodayWeather(location) {
    loadingElement.classList.remove('visually-hidden');
    loadingElement.classList.add('visually-show');
    const api = "/search/weather/search_weather_info";
    const params = { position: `${location.lng},${location.lat}` };

    return new Promise((resolve, reject) => {
        try {
            map.requestAPI(api, params, (response) => {
                if (response.ret && response.ret.status === 'OK') {
                    resolve(response.ret.message.result.item[0]);
                    loadingElement.classList.remove('visually-show');
                    loadingElement.classList.add('visually-hidden');
                } else {
                    reject("Today_weather検索失敗");
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Optimized: Async today_popup with caching
async function today_popup(location, area_name) {
    const cacheKey = `${location.lng},${location.lat}`;
    if (todayPopupCache[cacheKey]) {
        showTodayPopup(todayPopupCache[cacheKey], location, area_name);
        return;
    }
    try {
        loadingElement.classList.remove('visually-show');
        const data = await fetchTodayWeather(location);
        todayPopupCache[cacheKey] = data; // Cache the result
        showTodayPopup(data, location, area_name);
    } catch (error) {
        console.error("Today_weatherエラーが発生しました:", error);
    }
}

// Helper: Create and add the popup widget
function showTodayPopup(data, location, area_name) {
    if (weatherToday_widget) {
        removePopup();
    }
    const htmlContent = createTodayPopupHTML(data, area_name);
    weatherToday_widget = new ZDC.Popup(location, { htmlSource: htmlContent });
    map.addWidget(weatherToday_widget);
}


function removePopup() {
    map.removeWidget(weatherToday_widget);
}

// Marker creation function (using local variable for each marker)
function showMarker(weather_poi) {
    weather_poi.forEach((location) => {
        const marker = new ZDC.Marker(location, {
            styleId: ZDC.MARKER_COLOR_ID_RED_L,
            contentStyleId: ZDC.MARKER_NUMBER_ID_STAR_L,
        });
        marker.addEventListener('click', function () {
            week_forecast(marker.getLatLng());

        });
        map.addWidget(marker);
    });
}

// Helper function to get icon HTML after checking if the file exists
async function getWeatherIconHTML(weather_code, weather_status) {
    const imgUrl = `weather_icon/${weather_code}.svg`;
    try {
        // Perform a HEAD request to check if the file exists.
        const response = await fetch(imgUrl, { method: 'HEAD' });
        if (response.ok) {
            // Return the img tag if the file exists.
            return `<img src="${imgUrl}" class="card-img-top" alt="${weather_status}">`;
        } else {
            // Fallback to plain text if the file is not found.
            return `<p class="m-0">${weather_status}</p>`;
        }
    } catch (error) {
        // On any error, return the weather status text.
        return `<p class="m-0">${weather_status}</p>`;
    }
}

// Week forecast function (updated to use async/await for checking icon existence)
function week_forecast(location) {
    const [fromDate, toDate] = from_to_date();
    const api = "/search/weather/search_weather_week_info";
    const params = {
        position: `${location.lng},${location.lat}`,
        datefrom: fromDate,
        dateto: toDate,
        datum: "JGD",
    };

    try {
        map.requestAPI(api, params, function (response) {
            if (response.ret && response.ret.status === 'OK') {
                (async function () {
                    const weather_response = response.ret.message.result;
                    let weatherCards = "";
                    let area_name = "";

                    // Process each day's forecast asynchronously.
                    for (let i = 0; i < 7; i++) {
                        const dailyWeather = weather_response.weather[i];
                        const weather_code = dailyWeather.weather_data.weather_cd;
                        const weather_status = dailyWeather.weather_data.weather_text;
                        const forecastDate = dailyWeather.weather_data.forecast_date;
                        const precipChance = extractNumber(dailyWeather.weather_data.precipChance);
                        const max_temp = dailyWeather.weather_data.max_temp_degree;
                        const min_temp = dailyWeather.weather_data.min_temp_degree;
                        const pref_name = dailyWeather.pref_nm;
                        let reliability = dailyWeather.weather_data.reliability;
                        area_name = dailyWeather.area_nm;

                        // For the header card, display labels only once.
                        if (i === 0) {
                            weatherCards += `                    
                            <div class="card text-center">
                                <hr class="border border-dark border-2 opacity-50">
                                <div class="card-body">
                                    <h5 class="areaName">${area_name}</h5>
                                    <p class="card-text">日付</p>
                                    <hr class="border border-dark border-2 opacity-50">
                                    <p class="card-text">降水確率(%)</p>
                                    <hr class="border border-dark border-2 opacity-50">
                                    <h5 class="card-title">${pref_name}</h5>
                                    <p class="card-text"><span style="color:red;">最高</span> / <span style="color:blue;">最低</span> (℃)</p>
                                    <hr class="border border-dark border-2 opacity-50">
                                    <p class="card-text"><small class="text-body-secondary">信頼度</small></p>
                                </div>
                            </div>`;
                        }

                        if (reliability === null) reliability = "-";
                        const formattedForcastDate = convertDate(forecastDate, 'week');

                        // Get the icon HTML (this awaits the HEAD request)
                        const iconHTML = await getWeatherIconHTML(weather_code, weather_status);

                        weatherCards += `
                            <div class="card text-center">
                                <hr class="border border-dark border-2 opacity-50">
                                ${iconHTML}
                                <div class="card-body">
                                    <h5 class="card-title">${weather_status}</h5>
                                    <p class="card-text">${formattedForcastDate}</p>
                                    <hr class="border border-dark border-2 opacity-50">
                                    <p class="card-text">${precipChance}</p>
                                    <hr class="border border-dark border-2 opacity-50">
                                    <h5 class="temp"></h5>
                                    <p class="card-text"><span style="color:red;">${max_temp}</span> / <span style="color:blue;">${min_temp}</span></p>
                                    <hr class="border border-dark border-2 opacity-50">
                                    <p class="card-text"><small class="text-body-secondary">${reliability}</small></p>
                                </div>
                            </div>`;
                    }
                    document.getElementById('week-forecast').innerHTML = weatherCards;
                    today_popup(location, area_name);
                })();
            } else {
                console.error("Week_Weather検索失敗");
            }
        });
    } catch (error) {
        console.error("Week_Weather検索中にエラーが発生しました:", error);
    }
}

// Extract a number from a string with 'パーセント'
function extractNumber(input) {
    if (input.includes('パーセント')) {
        let numberString = input.replace('パーセント', '');
        numberString = numberString.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
        return parseInt(numberString, 10);
    }
    return input;
}

// Initialize ZMALoader and the map
ZMALoader.setOnLoad(function (mapOptions, error) {
    if (error) {
        console.error(error);
        return;
    }
    Object.assign(mapOptions, {
        mouseWheelReverseZoom: true,
        centerZoom: false,
        center: new ZDC.LatLng(35.6883444933389, 139.75312809703533),
        rotatable: true,
        tiltable: true,
        zoom: 10,
        minZoom: 3,
    });

    map = new ZDC.Map(
        document.getElementById('ZMap'),
        mapOptions,
        function () {
            const weather_poi = [
                new ZDC.LatLng(35.6883444933389, 139.75312809703533), // 東京
                new ZDC.LatLng(43.060015261847646, 141.35439106869504), // 札幌
                new ZDC.LatLng(34.670229387890956, 135.49805041142122), // 大阪
                new ZDC.LatLng(33.589826045571265, 130.40334745425807), // 福岡
                new ZDC.LatLng(26.219315985997966, 127.67049106354028) //　那覇

            ];
            week_forecast(weather_poi[0]);
            showMarker(weather_poi);
        },
        function () {
            console.error("APIエラー");
        }
    );
});
