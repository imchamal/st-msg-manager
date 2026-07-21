// ============================================================
// 메시지 매니저 (Message Manager) - index.js
// ------------------------------------------------------------
// 이 파일은 확장프로그램의 "두뇌" 역할을 해요.
// 지금은 뼈대(스켈레톤)만 만들어둔 상태이고,
// 앞으로 기능을 하나씩 여기에 채워나갈 거예요.
// ============================================================

// 실리태번의 모든 핵심 기능(채팅 데이터, 저장 함수 등)은
// 이 getContext() 함수 하나로 꺼내 쓸 수 있어요.
const context = SillyTavern.getContext();
const { eventSource, event_types, extensionSettings, saveSettingsDebounced } = context;

// 우리 확장을 구분하는 고유한 이름표예요.
// 다른 확장이랑 이름이 겹치면 안 되니까, 고유하게 지어요.
const MODULE_NAME = 'silly_message_manager';

// 확장이 처음 설치됐을 때 사용할 기본 설정값들이에요.
// (예: 나중에 "라이트 테마 강제 여부" 같은 옵션을 여기에 추가할 수 있어요)
const defaultSettings = Object.freeze({
    enabled: true,
});

/**
 * 설정값을 가져오거나, 없으면 기본값으로 새로 만들어주는 함수예요.
 * 확장이 업데이트돼서 새로운 옵션이 추가돼도,
 * 기존 사용자 설정을 안전하게 유지해주는 역할을 해요.
 */
function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    // 새로 추가된 기본값 항목이 있으면 채워 넣어요.
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

/**
 * 화면에 원형 플로팅 버튼을 만드는 함수예요.
 * 지금은 "설치가 잘 됐는지 확인"하는 용도로,
 * 버튼만 화면에 띄우고 누르면 콘솔에 로그만 찍도록 해뒀어요.
 * (원형 메뉴, 각 기능들은 다음 단계에서 하나씩 채울 거예요)
 */
function createFloatingButton() {
    // 혹시 이미 버튼이 있다면 중복으로 만들지 않도록 방지해요.
    if (document.getElementById('smm-floating-button')) {
        return;
    }

    const button = document.createElement('div');
    button.id = 'smm-floating-button';
    button.title = '메시지 매니저';
    button.innerHTML = '<i class="fa-solid fa-list-check"></i>';

    button.addEventListener('click', () => {
        console.log(`[${MODULE_NAME}] 플로팅 버튼 클릭됨 (아직 메뉴는 없어요)`);
    });

    document.body.appendChild(button);
}

/**
 * 확장이 실제로 시작될 때 실행되는 함수예요.
 * 여기서 설정을 불러오고, 화면에 버튼을 만들어요.
 */
function init() {
    getSettings();
    createFloatingButton();
    console.log(`[${MODULE_NAME}] 확장프로그램이 로드되었습니다.`);
}

// APP_READY: 실리태번 화면이 완전히 다 뜬 다음에 실행돼요.
// 우리 확장의 UI를 만드는 작업은 보통 이 타이밍에 하는 게 안전해요.
eventSource.on(event_types.APP_READY, init);
