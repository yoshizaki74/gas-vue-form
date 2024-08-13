// 暗号化・複合化フレーズ
const passPhrase = 's@VvD0&aP9';

// 棚板フォームWebシステム()
const DB_SSID = '';
// 棚板フォーム管理表()
const ADMIN_SSID = '';

/** リクエスト受信処理
 * クライアント側からWEBサーバにリクエスト(アクセス)された際にコールされクライアント側に画面を返す関数。
 * @param{object.<>}
 * @return{object.<>}
 */
function doGet(e) {
  let templateFile;
  let title;

  // ページタイプによってテンプレートファイルとタイトルを設定
  switch (e.parameter.page) {
    case 'shelfboard-index':
      templateFile = 'shelfboard-index';
      title = 'フォームアプリ';
      break;
  }

  // テンプレートファイルが設定されている場合、ページを生成
  if (templateFile) {
    const template = HtmlService.createTemplateFromFile(templateFile);
    if (templateFile !== 'shelfboard-index') {
      template.deployUrl = ScriptApp.getService().getUrl();
    }
    const output = template.evaluate();
    output
      .setTitle(title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no, minimal-ui');
    return output;
  }
}

/** 商品DBと棚受金物DB取得 */
function getAllLumberData() {
  const ss = SpreadsheetApp.openById(DB_SSID);

  // 商品DBの取得
  const lumberSheet = ss.getSheetByName('商品DB');
  const lumberDataValues = lumberSheet.getRange(2, 1, lumberSheet.getLastRow() - 1, lumberSheet.getLastColumn()).getValues();

  const lumberData = {};
  const uniqueLumberTypes = new Set();

  lumberDataValues.forEach(row => {
    const displayName = `${row[8]}（${row[6]}）`;
    const thickness = row[0];
    const depth = row[1];
    const width = row[2];

    uniqueLumberTypes.add(displayName);

    if (!lumberData[displayName]) {
      lumberData[displayName] = {};
    }

    if (!lumberData[displayName][thickness]) {
      lumberData[displayName][thickness] = {};
    }

    if (!lumberData[displayName][thickness][depth]) {
      lumberData[displayName][thickness][depth] = [];
    }

    lumberData[displayName][thickness][depth].push({
      width: width,
      code: row[3],
      partNumber: row[4],
      orderFlag: row[5],
      type: row[7],
    });
  });

  const uniqueLumberTypesArray = Array.from(uniqueLumberTypes);

  // 棚受金物DBの取得
  const shelfHardwareSheet = ss.getSheetByName('棚受金物DB');
  const shelfHardwareDataValues = shelfHardwareSheet.getRange(2, 1, shelfHardwareSheet.getLastRow() - 1, shelfHardwareSheet.getLastColumn()).getValues();

  const shelfColumnsData = [];
  const shelfSupportsData = [];
  const shelfScrewsData = [];
  const endCapsData = [];

  shelfHardwareDataValues.forEach(row => {
    // 棚柱
    if (row[1] != '') {
      shelfColumnsData.push({
        color: row[1],
        size: row[2],
        screwCount: row[3]
      });
    }
    // 棚受
    if (row[6] != '') {
      shelfSupportsData.push({
        color: row[6],
        rubber: row[7],
        unit: row[8]
      });
    }

    // 棚柱用ビス
    if (row[11] != '') {
      shelfScrewsData.push({
        color: row[11],
        length: row[12],
        material: row[13],
        unit: row[14]
      });
    }

    // エンドキャップ
    if (row[17] != '') {
      endCapsData.push({
        color: row[17]
      });
    }
  });

  const shelfHardwareData = {
    shelfColumns: {},
    shelfSupports: {},
    shelfScrews: {},
    endCaps: {},
  };

  shelfColumnsData.forEach(item => {
    const displayName = `棚柱（${item.color}）`;
    if (!shelfHardwareData.shelfColumns[displayName]) {
      shelfHardwareData.shelfColumns[displayName] = [];
    }
    shelfHardwareData.shelfColumns[displayName].push({
      size: item.size,
      screwCount: item.screwCount
    });
  });

  shelfSupportsData.forEach(item => {
    const displayName = `棚受（${item.color}）`;
    if (!shelfHardwareData.shelfSupports[displayName]) {
      shelfHardwareData.shelfSupports[displayName] = [];
    }
    shelfHardwareData.shelfSupports[displayName].push({
      rubber: item.rubber,
      unit: item.unit
    });
  });

  shelfScrewsData.forEach(item => {
    const displayName = `棚柱用ビス（${item.color}）`;
    if (!shelfHardwareData.shelfScrews[displayName]) {
      shelfHardwareData.shelfScrews[displayName] = [];
    }
    shelfHardwareData.shelfScrews[displayName].push({
      length: item.length,
      material: item.material,
      unit: item.unit
    });
  });

  endCapsData.forEach(item => {
    const displayName = `エンドキャップ（${item.color}）`;
    if (!shelfHardwareData.endCaps[displayName]) {
      shelfHardwareData.endCaps[displayName] = [];
    }
    shelfHardwareData.endCaps[displayName].push({color:item.color});
  });

  Logger.log(shelfHardwareData);

  return {
    uniqueLumberTypes: uniqueLumberTypesArray,
    lumberData: lumberData,
    shelfHardwareData: shelfHardwareData
  };
}

function submitFormToGoogleForm(data) {
  Logger.log("回答送信（スプレッドシート）");

  // Lockサービスを取得
  const lock = LockService.getScriptLock();

  // セッションIDを生成
  const sessionId = Utilities.getUuid();

  // 管理表
  const ssFormManagement = SpreadsheetApp.openById(ADMIN_SSID);
  const shFormDb = ssFormManagement.getSheetByName('発注フォームDB');
  const shFormLog = ssFormManagement.getSheetByName('ログ');

  const now = new Date();

  const todayStr = Utilities.formatDate(now, 'JST', 'yyyy-MM-dd HH:mm:ss');

  // 注文番号の生成
  const orderNumber = Utilities.formatDate(now, 'JST', 'yyMMdd') + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, '0');

  // ロックを試みる
  if (!lock.tryLock(10000)) {  // 最大10秒間待機してロックを取得
    Logger.log("10秒待ちましたが、ロックを取得できませんでした。");
    return {'status': 'error', 'message': "エラーが発生しました。再度送信してください。 Error-100"};
  }

  shFormLog.appendRow([todayStr, orderNumber, sessionId, "[回答送信]スクリプトロック"]);

  if (!shFormDb) {
    Logger.log("DBシートが見つかりません");
    return {'status': 'error', 'message': "エラーが発生しました。再度送信してください。 Error-200"};
  }

  if (!shFormLog) {
    Logger.log("ログシートが見つかりません");
    return {'status': 'error', 'message': "エラーが発生しました。再度送信してください。 Error-300"};
  }
  
  try {
    shFormLog.appendRow([todayStr, orderNumber, sessionId, "[回答送信]開始"]);

    let scriptProperties = PropertiesService.getScriptProperties();
    
    shFormLog.appendRow([todayStr, orderNumber, sessionId, "[回答送信]セッション保存開始"]);
    
    Logger.log("セッション保存");
    scriptProperties.setProperty(sessionId, JSON.stringify(data)); // セッションIDをキーにデータを保存

    Logger.log("セッションIDをログに残す");
    shFormLog.appendRow([todayStr, orderNumber, sessionId, "[回答送信]セッション保存成功"]);

    // データをシートに保存
    const newRow = [
      todayStr,
      orderNumber,
      data.customerName || '',
      data.requestDate || '',
      data.deliveryDate || '',
      data.contactName || '',
      data.contactPhone ? "'" + data.contactPhone : '',
      data.contactMail || '',
      data.deliveryAddress || '',
      data.elevator || '',
      data.keyNumber || '',
      data.items && data.items[0] ? data.items[0].lumberType : '',
      data.items && data.items[0] ? data.items[0].thickness : '',
      data.items && data.items[0] ? data.items[0].width : '',
      data.items && data.items[0] ? data.items[0].depth : '',
      data.items && data.items[0] ? data.items[0].edgeTapeW : '',
      data.items && data.items[0] ? data.items[0].edgeTapeD : '',
      data.items && data.items[0] ? data.items[0].quantity : '',
      data.items && data.items[0] ? data.items[0].note : '',
      data.items && data.items[1] ? data.items[1].lumberType : '',
      data.items && data.items[1] ? data.items[1].thickness : '',
      data.items && data.items[1] ? data.items[1].width : '',
      data.items && data.items[1] ? data.items[1].depth : '',
      data.items && data.items[1] ? data.items[1].edgeTapeW : '',
      data.items && data.items[1] ? data.items[1].edgeTapeD : '',
      data.items && data.items[1] ? data.items[1].quantity : '',
      data.items && data.items[1] ? data.items[1].note : '',
      data.items && data.items[2] ? data.items[2].lumberType : '',
      data.items && data.items[2] ? data.items[2].thickness : '',
      data.items && data.items[2] ? data.items[2].width : '',
      data.items && data.items[2] ? data.items[2].depth : '',
      data.items && data.items[2] ? data.items[2].edgeTapeW : '',
      data.items && data.items[2] ? data.items[2].edgeTapeD : '',
      data.items && data.items[2] ? data.items[2].quantity : '',
      data.items && data.items[2] ? data.items[2].note : '',
      data.items && data.items[3] ? data.items[3].lumberType : '',
      data.items && data.items[3] ? data.items[3].thickness : '',
      data.items && data.items[3] ? data.items[3].width : '',
      data.items && data.items[3] ? data.items[3].depth : '',
      data.items && data.items[3] ? data.items[3].edgeTapeW : '',
      data.items && data.items[3] ? data.items[3].edgeTapeD : '',
      data.items && data.items[3] ? data.items[3].quantity : '',
      data.items && data.items[3] ? data.items[3].note : '',
      data.items && data.items[4] ? data.items[4].lumberType : '',
      data.items && data.items[4] ? data.items[4].thickness : '',
      data.items && data.items[4] ? data.items[4].width : '',
      data.items && data.items[4] ? data.items[4].depth : '',
      data.items && data.items[4] ? data.items[4].edgeTapeW : '',
      data.items && data.items[4] ? data.items[4].edgeTapeD : '',
      data.items && data.items[4] ? data.items[4].quantity : '',
      data.items && data.items[4] ? data.items[4].note : '',
      data.items && data.items[5] ? data.items[5].lumberType : '',
      data.items && data.items[5] ? data.items[5].thickness : '',
      data.items && data.items[5] ? data.items[5].width : '',
      data.items && data.items[5] ? data.items[5].depth : '',
      data.items && data.items[5] ? data.items[5].edgeTapeW : '',
      data.items && data.items[5] ? data.items[5].edgeTapeD : '',
      data.items && data.items[5] ? data.items[5].quantity : '',
      data.items && data.items[5] ? data.items[5].note : '',
      data.items && data.items[6] ? data.items[6].lumberType : '',
      data.items && data.items[6] ? data.items[6].thickness : '',
      data.items && data.items[6] ? data.items[6].width : '',
      data.items && data.items[6] ? data.items[6].depth : '',
      data.items && data.items[6] ? data.items[6].edgeTapeW : '',
      data.items && data.items[6] ? data.items[6].edgeTapeD : '',
      data.items && data.items[6] ? data.items[6].quantity : '',
      data.items && data.items[6] ? data.items[6].note : '',
      data.items && data.items[7] ? data.items[7].lumberType : '',
      data.items && data.items[7] ? data.items[7].thickness : '',
      data.items && data.items[7] ? data.items[7].width : '',
      data.items && data.items[7] ? data.items[7].depth : '',
      data.items && data.items[7] ? data.items[7].edgeTapeW : '',
      data.items && data.items[7] ? data.items[7].edgeTapeD : '',
      data.items && data.items[7] ? data.items[7].quantity : '',
      data.items && data.items[7] ? data.items[7].note : '',
      data.assemblyItems && data.assemblyItems.shelfColumns ? data.assemblyItems.shelfColumns.find(item => item.color === 'シルバー')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfColumns ? data.assemblyItems.shelfColumns.find(item => item.color === 'ホワイト')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfColumns ? data.assemblyItems.shelfColumns.find(item => item.color === 'ブラック')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfSupports ? data.assemblyItems.shelfSupports.find(item => item.color === 'ブラック' && item.rubber === 'なし')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfSupports ? data.assemblyItems.shelfSupports.find(item => item.color === 'ブラック' && item.rubber === 'ブラック')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfSupports ? data.assemblyItems.shelfSupports.find(item => item.color === 'シルバー' && item.rubber === 'なし')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfSupports ? data.assemblyItems.shelfSupports.find(item => item.color === 'シルバー' && item.rubber === 'ブラック')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfSupports ? data.assemblyItems.shelfSupports.find(item => item.color === 'ホワイト' && item.rubber === 'なし')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfSupports ? data.assemblyItems.shelfSupports.find(item => item.color === 'ホワイト' && item.rubber === 'ホワイト')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfScrews ? data.assemblyItems.shelfScrews.find(item => item.color === 'シルバー' && item.material === 'ステンレス製' && item.length === '32mm')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfScrews ? data.assemblyItems.shelfScrews.find(item => item.color === 'シルバー' && item.material === '鉄製' && item.length === '20mm')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfScrews ? data.assemblyItems.shelfScrews.find(item => item.color === 'ブラック' && item.material === '鉄製' && item.length === '20mm')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfScrews ? data.assemblyItems.shelfScrews.find(item => item.color === 'ホワイト(頭部色)' && item.material === 'ステンレス製' && item.length === '32mm')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.shelfScrews ? data.assemblyItems.shelfScrews.find(item => item.color === 'ホワイト(頭部色)' && item.material === '鉄製' && item.length === '20mm')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.endCaps ? data.assemblyItems.endCaps.find(item => item.color === 'ブラック')?.quantity || '' : '',
      data.assemblyItems && data.assemblyItems.endCaps ? data.assemblyItems.endCaps.find(item => item.color === 'ホワイト')?.quantity || '' : '',
    ];

    Logger.log(newRow);

    shFormDb.appendRow(newRow);

    shFormLog.appendRow([todayStr, orderNumber, sessionId, "[回答送信]完了"]);

    return {'status': 'success', 'orderNumber': orderNumber};
  } catch (e) {
    Logger.log(e);
    shFormLog.appendRow([todayStr, orderNumber, sessionId, "[回答送信]失敗：" + e.message]);
    return {'status': 'error', 'message': '注文番号：' + orderNumber + '-' + e.message};
  } finally {
    shFormLog.appendRow([todayStr, orderNumber, sessionId, "[回答送信]スクリプトロック解除"]);
    lock.releaseLock();
  }
}
