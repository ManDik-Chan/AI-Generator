import streamlit as st
from utils import (
    verify_api_key,
    get_chat_response
)
from langchain.memory import ConversationBufferMemory
import streamlit.components.v1 as components
from character_templates import CHARACTER_TEMPLATES
from pathlib import Path
import os
import base64
from components.avatar_manager import AvatarManager
from content_assistant import render_content_assistant
from medical_assistant import render_medical_assistant
from legal_assistant import render_legal_assistant


# 初始化头像管理器
avatar_manager = AvatarManager()

# 配置页面基本设置
st.set_page_config(
    page_title="内容生成器",
    page_icon="📝",
    layout="wide"
)

# 配置全局路径
ASSETS_DIR = Path("assets")
AVATARS_DIR = ASSETS_DIR / "avatars"

# 确保必要的目录存在
ASSETS_DIR.mkdir(exist_ok=True)
AVATARS_DIR.mkdir(exist_ok=True)

# 模型映射配置
model_mapping = {
    "GLM-4": ("glm", "GLM-4-Plus"),
    "通义千问 (Qwen)": ("qwen", "Qwen-Max"),
    "ChatGPT-4": ("chatgpt", "GPT-4"),
    "Claude 3.5": ("claude", "Claude-3-Sonnet")
}

# 模型名称映射
model_display_names = {
    "qwen": "通义千问",
    "chatgpt": "ChatGPT",
    "claude": "Claude",
    "glm": "智谱GLM"
}

# 初始化 session state 中的 API 密钥
if 'api_keys' not in st.session_state:
    st.session_state.api_keys = {
        'qwen': st.secrets.get("api_keys", {}).get("dashscope", ""),
        'chatgpt': "",
        'claude': "",
        'glm': st.secrets.get("api_keys", {}).get("glm", "")
    }

# 初始化其他 session state 变量
if 'use_env_qwen_key' not in st.session_state:
    st.session_state.use_env_qwen_key = False
if 'use_env_glm_key' not in st.session_state:
    st.session_state.use_env_glm_key = False
if 'character_messages' not in st.session_state:
    st.session_state.character_messages = {}
if 'character_memories' not in st.session_state:
    st.session_state.character_memories = {}
if 'selected_character' not in st.session_state:
    st.session_state.selected_character = "默认"
if 'travel_response' not in st.session_state:
    st.session_state.travel_response = None
if 'doctor_messages' not in st.session_state:
    st.session_state.doctor_messages = []
if 'medical_state' not in st.session_state:
    st.session_state.medical_state = {
        'symptoms_result': None,
        'health_check_result': None,
        'medication_result': None,
        'recovery_result': None,
        'prevention_result': None,
        'hospital_result': None,
        'exercise_result': None
    }

# 侧边栏配置
with st.sidebar:
    st.subheader("🤖 模型选择")

    # 更新模型信息
    model_info = {
        "GLM-4": {
            "key": "glm",
            "model_name": "GLM-4-Plus",
            "description": "智谱最新版ChatGLM大模型",
            "api_label": "智谱API密钥:",
            "api_url": "https://open.bigmodel.cn/usercenter/apikeys"
        },
        "ChatGPT-4": {
            "key": "chatgpt",
            "model_name": "GPT-4",
            "description": "OpenAI最新版GPT-4大模型",
            "api_label": "OpenAI API密钥:",
            "api_url": "https://platform.openai.com/api-keys"
        },
        "Claude 3.5": {
            "key": "claude",
            "model_name": "Claude-3-Sonnet-20240229",
            "description": "Anthropic最新版Claude 3大模型",
            "api_label": "Anthropic API密钥:",
            "api_url": "https://console.anthropic.com/settings/keys"
        },
        "通义千问 (Qwen)": {
            "key": "qwen",
            "model_name": "Qwen-Max",
            "description": "阿里云最新版通义千问大模型",
            "api_label": "通义千问API密钥:",
            "api_url": "https://bailian.console.aliyun.com/?apiKey=1#/api-key"
        }
    }

    # 模型选择下拉框
    model_type = st.selectbox(
        "选择AI模型",
        list(model_info.keys()),
        key="model_select"
    )

    # 显示模型详细信息
    st.caption(f"**当前模型**: {model_info[model_type]['model_name']}")
    st.caption(f"**模型说明**: {model_info[model_type]['description']}")
    st.markdown(f"🔗 [获取API密钥]({model_info[model_type]['api_url']})")

    st.markdown("---")
    st.subheader("🔑 API密钥配置")

    # 获取当前选中的模型信息
    model_key = model_info[model_type]['key']
    key_label = model_info[model_type]['api_label']
    key_url = model_info[model_type]['api_url']

    # 处理API密钥输入
    if model_key in ["qwen", "glm"]:
        # 为qwen和glm显示预存密钥选项
        use_stored_key = st.checkbox(
            "使用预存密钥",
            key=f"use_stored_{model_key}",
            value=st.session_state.get(f'use_env_{model_key}_key', False)
        )

        if use_stored_key:
            # 使用预存密钥
            st.session_state[f'use_env_{model_key}_key'] = True
            api_key = st.session_state.api_keys[model_key]
            st.text_input(
                key_label,
                value="*" * 10,
                disabled=True,
                type="password"
            )
            st.info("✅ 已加载预存密钥")
        else:
            # 手动输入密钥
            st.session_state[f'use_env_{model_key}_key'] = False
            api_key = st.text_input(
                key_label,
                type="password",
                value="",
                key=f"{model_key}_key"
            )
            if api_key:  # 如果用户输入了新的密钥
                st.session_state.api_keys[model_key] = api_key
    else:
        # 其他模型的密钥输入
        api_key = st.text_input(
            key_label,
            type="password",
            value=st.session_state.api_keys.get(model_key, ''),
            key=f"{model_key}_key"
        )
        if api_key:  # 如果用户输入了新的密钥
            st.session_state.api_keys[model_key] = api_key

    # 验证和保存按钮
    col1, col2 = st.columns(2)

    with col1:
        if st.button("🔍 验证密钥",
                     key="verify_btn",
                     disabled=not api_key):
            if not api_key:
                st.error("⚠️ 请输入密钥！")
            else:
                with st.spinner("正在验证密钥..."):
                    try:
                        is_valid, message = verify_api_key(model_key, api_key)
                        if is_valid:
                            st.success(f"✅ {message}")
                            st.session_state[f"{model_key}_verified"] = True
                        else:
                            st.error(f"❌ {message}")
                            st.session_state[f"{model_key}_verified"] = False
                    except Exception as e:
                        st.error(f"❌ 验证过程出错: {str(e)}")
                        st.session_state[f"{model_key}_verified"] = False
    with col2:
        if st.button("💾 保存密钥",
                     key="save_btn",
                     disabled=not api_key):
            if not api_key:
                st.error("⚠️ 请输入密钥！")
            elif not st.session_state.get(f"{model_key}_verified", False):
                st.error("⚠️ 请先验证密钥！")
            else:
                st.session_state.api_keys[model_key] = api_key
                st.success("✅ 密钥已保存！")

    # 更新模型状态
    previous_model = st.session_state.get('previous_model_type', None)
    current_model = model_mapping[model_type][0]
    st.session_state['current_model_type'] = current_model

def create_copy_button(text: str, button_text: str = "📋 复制到剪贴板", key: str = None) -> None:
    """使用 JavaScript 实现的复制功能"""
    if key not in st.session_state:
        st.session_state[key] = False

    # 创建唯一的键值
    button_key = f"btn_{key}"

    # JavaScript 复制函数
    js_code = f"""
    <script>
    function copyToClipboard_{key}() {{
        const text = `{text}`;
        navigator.clipboard.writeText(text).then(
            function() {{
                // Success callback
                document.getElementById("{button_key}_status").innerHTML = "✅ 已复制到剪贴板！";
                setTimeout(function() {{
                    document.getElementById("{button_key}_status").innerHTML = "";
                }}, 2000);
            }},
            function() {{
                // Error callback
                document.getElementById("{button_key}_status").innerHTML = "❌ 复制失败，请手动复制";
                setTimeout(function() {{
                    document.getElementById("{button_key}_status").innerHTML = "";
                }}, 2000);
            }}
        );
    }}
    </script>
    """

    # HTML 按钮
    html_button = f"""
    <button 
        onclick="copyToClipboard_{key}()" 
        style="width: 100%; padding: 0.5rem; background-color: #0078D4; color: white; border: none; border-radius: 4px; cursor: pointer;"
    >
        {button_text}
    </button>
    <div id="{button_key}_status" style="text-align: center; margin-top: 0.5rem;"></div>
    """

    # 渲染HTML
    st.components.v1.html(js_code + html_button, height=80)


def get_welcome_message(character_type: str, model_type: str = None) -> str:
    """
    根据角色类型和模型类型生成欢迎消息

    Args:
        character_type: 角色类型（如"AI助手"或其他角色）
        model_type: 模型类型（如"qwen", "chatgpt", "claude", "glm"）

    Returns:
        str: 生成的欢迎消息
    """
    if character_type == "AI助手" and model_type:
        model_display_names = {
            "qwen": "通义千问",
            "chatgpt": "ChatGPT",
            "claude": "Claude",
            "glm": "智谱GLM"
        }
        model_name = model_display_names.get(model_type, "AI")
        return f"你好，我是由{model_name}驱动的AI助手，请问有什么可以帮你的吗？"
    elif character_type in CHARACTER_TEMPLATES:
        # 构建人设提示词
        character = CHARACTER_TEMPLATES[character_type]
        prompt = f"""
你现在是一个{character['name']}。

个性特点：
{character['personality']}

请根据以上人设，生成一个独特的开场白（不超过50字），展现你的性格特点。直接输出开场白内容，不需要任何解释。
"""
        try:
            # 获取当前选择的模型类型和API密钥
            current_model_key = st.session_state.get('current_model_type')
            api_key = st.session_state.api_keys.get(current_model_key)

            # 使用AI生成开场白
            response = get_chat_response(
                prompt=prompt,
                memory=None,
                model_type=current_model_key,
                api_key=api_key,
                character_type=None,
                is_chat_feature=False
            )
            return response.strip()
        except Exception as e:
            print(f"生成开场白失败: {str(e)}")
            # 如果AI生成失败，使用默认开场白
            return f"你好，我是{character['name']}，有什么可以帮你的吗？"

    return "你好，我是AI助手，有什么可以帮你的吗？"

# 主界面标签页配置
tabs = st.tabs([
    "✍️ AI写作",
    "🗨️ AI聊天",
    "🌍 旅游助手",
    "👨‍⚕️ 医疗助手",
    "⚖️ 政法助手(目前仅支持GLM-4模型)"
])

# AI写作标签页
with tabs[0]:
    render_content_assistant()

# AI聊天标签页
with tabs[1]:
    st.header("💭 AI聊天助手")

    # 创建两列布局
    col1, col2 = st.columns([2, 1])

    with col2:
        # 人设选择部分
        previous_character = st.session_state.get('selected_character', "AI助手")
        st.session_state.selected_character = st.selectbox(
            "🎭 选择AI人设",
            ["AI助手"] + [char for char in CHARACTER_TEMPLATES.keys() if char not in ["AI助手", "默认"]],
            key="character_select"
        )

        # 获取当前选择的模型类型
        current_model = model_mapping[model_type][0]

        # 检测人设是否改变
        if previous_character != st.session_state.selected_character:
            if st.session_state.selected_character not in st.session_state.character_messages:
                # 获取欢迎消息（使用AI生成）
                with st.spinner("正在准备角色..."):
                    welcome_msg = get_welcome_message(st.session_state.selected_character, current_model)

                # 初始化新人设的消息和记忆
                st.session_state.character_messages[st.session_state.selected_character] = [
                    {"role": "assistant", "content": welcome_msg}
                ]
                # 创建新的记忆实例
                st.session_state.character_memories[st.session_state.selected_character] = ConversationBufferMemory(
                    return_messages=True,
                    memory_key="chat_history",
                    input_key="input",
                    output_key="output"
                )

        if st.session_state.selected_character != "AI助手":
            character = CHARACTER_TEMPLATES[st.session_state.selected_character]
            st.markdown(f"**当前人设**: {character['name']}")
            with st.expander("👀 查看人设详情"):
                st.markdown(character['personality'])
                st.markdown("**示例回复:**")
                for example in character['example_responses']:
                    st.markdown(f"- {example}")


    def get_image_base64(image_path: str) -> str:
        """将图片转换为base64编码"""
        if not image_path:
            return ""

        try:
            if os.path.exists(image_path):
                with open(image_path, "rb") as image_file:
                    import base64
                    return base64.b64encode(image_file.read()).decode()
        except Exception as e:
            print(f"Error converting image to base64: {str(e)}")
        return ""

    with col1:
        def render_chat_interface():
            chat_container = st.container()
            current_model = st.session_state.get('current_model_type')

            with chat_container:
                if st.session_state.selected_character not in st.session_state.character_messages:
                    st.session_state.character_messages[st.session_state.selected_character] = []

                messages = st.session_state.character_messages[st.session_state.selected_character]

                for idx, message in enumerate(messages):
                    is_user = message["role"] == "user"

                    # 获取头像
                    if is_user:
                        avatar_html = f'<img src="{avatar_manager.get_user_avatar_base64()}" style="width: 40px; height: 40px; border-radius: 20px;'
                    else:
                        avatar_html = f'<img src="{avatar_manager.get_avatar_base64(st.session_state.selected_character, current_model)}" style="width: 40px; height: 40px; border-radius: 20px;'

                    if is_user:
                        avatar_html += ' margin-left: 10px;">'
                    else:
                        avatar_html += ' margin-right: 10px;">'

                    # 设置消息样式
                    if is_user:
                        st.markdown(
                            f"""
                            <div style="display: flex; justify-content: flex-end; align-items: flex-start; margin: 10px 0;">
                                <div style="max-width: 80%; text-align: right;">
                                    <div style="font-size: 12px; color: white; margin-bottom: 5px;">你</div>
                                    <div style="background-color: #2b313e; color: white; border-radius: 20px; padding: 15px;">
                                        {message["content"]}
                                    </div>
                                </div>
                                {avatar_html}
                            </div>
                            """,
                            unsafe_allow_html=True
                        )
                    else:
                        # 为AI助手使用特殊的样式
                        if st.session_state.selected_character == "AI助手":
                            model_styles = {
                                "qwen": ("#e6f3ff", "#0077cc"),  # 通义千问的蓝色主题
                                "chatgpt": ("#e9f7ef", "#28a745"),  # ChatGPT的绿色主题
                                "claude": ("#f5e6ff", "#6f42c1"),  # Claude的紫色主题
                                "glm": ("#fff3e6", "#fd7e14")  # GLM的橙色主题
                            }
                            style = model_styles.get(current_model, ("#f0f2f6", "#1a1a1a"))
                            name_suffix = f" ({model_display_names.get(current_model, 'AI')})"
                            character_name = "AI助手" + name_suffix
                        else:
                            # 其他角色使用原有的样式
                            character_styles = {
                                "温柔知性大姐姐": ("#f8e1e7", "#d35d90"),
                                "暴躁顶撞纹身男": ("#ffe4e1", "#ff4500"),
                                "呆呆萌萌萝莉妹": ("#ffebcd", "#ff69b4"),
                                "高冷霸道男总裁": ("#e6e6fa", "#483d8b"),
                                "阳光开朗小奶狗": ("#fff8dc", "#ffa500"),
                                "英姿飒爽女王大人": ("#e6e6fa", "#800080"),
                                "性感冷艳御姐": ("#FFE4E1", "#800020"),
                            }
                            style = character_styles.get(st.session_state.selected_character, ("#f0f2f6", "#1a1a1a"))
                            character_name = CHARACTER_TEMPLATES[st.session_state.selected_character]["name"]

                        st.markdown(
                            f"""
                            <div style="display: flex; justify-content: flex-start; align-items: flex-start; margin: 10px 0;">
                                {avatar_html}
                                <div style="max-width: 80%;">
                                    <div style="font-size: 12px; color: {style[1]}; margin-bottom: 5px;">
                                        {character_name}
                                    </div>
                                    <div style="background-color: {style[0]}; color: {style[1]}; border-radius: 20px; padding: 15px;">
                                        {message["content"]}
                                    </div>
                                </div>
                            </div>
                            """,
                            unsafe_allow_html=True
                        )



        def handle_input():
            """处理用户输入的函数"""
            if st.session_state.user_input and st.session_state.user_input.strip():
                user_input = st.session_state.user_input
                current_character = st.session_state.selected_character

                # 添加用户消息到历史记录
                if current_character not in st.session_state.character_messages:
                    st.session_state.character_messages[current_character] = []

                st.session_state.character_messages[current_character].append({
                    "role": "user",
                    "content": user_input
                })

                try:
                    # 获取当前模型信息
                    current_model_key = model_mapping[model_type][0]
                    api_key = st.session_state.api_keys[current_model_key]

                    # 确保记忆存在
                    if current_character not in st.session_state.character_memories:
                        st.session_state.character_memories[current_character] = ConversationBufferMemory(
                            return_messages=True,
                            memory_key="chat_history",
                            input_key="input",
                            output_key="output"
                        )

                    # 获取AI响应
                    response = get_chat_response(
                        prompt=user_input,
                        memory=st.session_state.character_memories[current_character],
                        model_type=current_model_key,
                        api_key=api_key,
                        character_type=current_character if current_character != "默认" else None,
                        is_chat_feature=True
                    )
                    # 添加AI响应到历史记录
                    st.session_state.character_messages[current_character].append({
                        "role": "assistant",
                        "content": response
                    })

                except Exception as e:
                    st.error(f"获取响应失败: {str(e)}")

                # 清空输入框
                st.session_state.user_input = ""


        # 显示对话界面
        if st.session_state.selected_character in st.session_state.character_messages:
            render_chat_interface()

            # 输入框和按钮布局
            col_input, col_button = st.columns([6, 1])

            with col_input:
                # 获取当前模型的验证状态
                current_model_key = model_mapping[model_type][0]
                is_key_verified = st.session_state.get(f"{current_model_key}_verified", False)

                if not is_key_verified:
                    st.warning("⚠️ 请先在侧边栏验证API密钥")
                elif st.session_state.selected_character == "默认":
                    st.warning("⚠️ 请先选择一个AI人设")
                else:
                    st.text_input(
                        "输入消息...",
                        key="user_input",
                        on_change=handle_input,
                        label_visibility="collapsed"
                    )

        with col_button:
            if st.button("🗑️", help="清空当前对话"):
                if st.session_state.selected_character in st.session_state.character_messages:
                    # 获取欢迎消息
                    character = CHARACTER_TEMPLATES[st.session_state.selected_character]
                    welcome_msg = f"你好，我是{character['name']}，有什么可以帮你的吗？"

                    # 重置消息历史
                    st.session_state.character_messages[st.session_state.selected_character] = [
                        {"role": "assistant", "content": welcome_msg}
                    ]

                    # 重置记忆
                    st.session_state.character_memories[st.session_state.selected_character] = ConversationBufferMemory(
                        return_messages=True,
                        memory_key="chat_history",
                        input_key="input",
                        output_key="output"
                    )
                    st.rerun()

with tabs[2]:
    st.header("🌍 智能旅游助手")

    # 创建两列布局
    col1, col2 = st.columns([2, 1])

    with col1:
        # 基本信息输入
        st.subheader("📝 旅行基本信息")

        # 目的地选择
        destination = st.text_input("🎯 目的地",
                                    placeholder="例如：北京、上海、成都等",
                                    help="请输入你想去的城市或景点")

        # 日期选择
        col_date1, col_date2 = st.columns(2)
        with col_date1:
            start_date = st.date_input("出发日期")
        with col_date2:
            end_date = st.date_input("返回日期")

        # 预算范围
        budget = st.slider("💰 预算范围（元）",
                           min_value=1000,
                           max_value=50000,
                           value=5000,
                           step=1000)

        # 出行人数
        travelers = st.number_input("👥 出行人数",
                                    min_value=1,
                                    max_value=10,
                                    value=2)

        # 出行偏好
        preferences = st.multiselect(
            "✨ 出行偏好（多选）",
            ["文化历史", "自然风光", "美食探索", "购物娱乐", "休闲度假", "户外运动"],
            default=["文化历史", "美食探索"]
        )

    with col2:
        # 添加功能选择区
        st.subheader("🎯 功能选择")

        function_options = {
            "行程规划": "根据你的偏好生成详细的日程安排",
            "交通建议": "提供最优的交通路线和方式",
            "住宿推荐": "推荐符合预算的酒店和住宿",
            "美食指南": "推荐当地特色美食和餐厅",
            "景点介绍": "介绍主要景点和票价信息",
            "天气查询": "查看目的地的天气预报",
            "花费预估": "估算整体旅行费用"
        }

        selected_function = st.radio(
            "选择需要的功能",
            list(function_options.keys()),
            format_func=lambda x: f"{x} - {function_options[x]}"
        )

    # 生成按钮
    current_model_key = model_mapping[model_type][0]
    is_key_verified = st.session_state.get(f"{current_model_key}_verified", False)

    if not is_key_verified:
        st.warning("⚠️ 请先在侧边栏验证API密钥")

    col_gen, col_clear = st.columns([4, 1])

    with col_gen:
        generate_btn = st.button("🎯 生成建议", use_container_width=True, disabled=not is_key_verified)

    with col_clear:
        if st.button("🗑️ 清除", use_container_width=True):
            st.session_state.travel_response = None
            st.rerun()

    if generate_btn:
        if not destination:
            st.error("⚠️ 请输入目的地")
            st.stop()

        with st.spinner(f"🎯 正在为您规划{destination}之旅..."):
            try:
                # 构建提示词
                days = (end_date - start_date).days + 1

                if selected_function == "行程规划":
                    prompt = f"""请帮我规划一个{destination}的{days}天行程。
具体信息如下：
- 出行日期：{start_date} 到 {end_date}
- 预算：{budget}元
- 出行人数：{travelers}人
- 偏好：{', '.join(preferences)}

请提供详细的行程安排，包括：
1. 每天的行程安排（景点、用餐、休息等）
2. 建议游玩时长
3. 交通方式建议
4. 用餐和休息时间安排
5. 注意事项和建议

请确保行程合理，充分考虑游玩时间和交通时间。"""

                elif selected_function == "交通建议":
                    prompt = f"""请为我推荐去{destination}的最佳交通方式。
具体信息如下：
- 出行日期：{start_date}
- 出行人数：{travelers}人
- 预算：{budget}元

请提供以下信息：
1. 不同交通方式的对比（飞机、高铁、大巴等）
2. 各种交通方式的大概价格
3. 最优交通方案建议
4. 当地交通卡办理建议
5. 从机场/车站到市区的交通建议"""

                elif selected_function == "住宿推荐":
                    prompt = f"""请为我在{destination}推荐合适的住宿。
具体信息如下：
- 入住日期：{start_date} 到 {end_date}
- 人数：{travelers}人
- 预算：每晚{budget // days}元左右

请提供以下信息：
1. 推荐的住宿区域
2. 不同价位的住宿选择
3. 各类型住宿的优缺点
4. 订房注意事项
5. 具体住宿推荐（含预估价格）"""

                elif selected_function == "美食指南":
                    prompt = f"""请为我推荐{destination}的特色美食。
具体信息如下：
- 预算：人均{budget // days // travelers}元/天
- 人数：{travelers}人

请提供以下信息：
1. 必尝特色美食清单
2. 推荐餐厅和小吃街
3. 各美食预估价格
4. 用餐建议和注意事项
5. 美食打卡地图规划"""

                elif selected_function == "景点介绍":
                    prompt = f"""请为我介绍{destination}的主要景点。

请提供以下信息：
1. 必游景点清单及门票价格
2. 各景点游玩建议时长
3. 最佳游玩时间
4. 门票预订建议
5. 景点之间的交通安排"""

                elif selected_function == "天气查询":
                    prompt = f"""请为我介绍{destination}的天气情况。
计划出行日期：{start_date} 到 {end_date}

请提供以下信息：
1. 当地天气特点
2. 建议携带的衣物
3. 天气对行程的影响
4. 出行建议
5. 必备物品清单"""

                else:  # 花费预估
                    prompt = f"""请帮我预估在{destination}旅行的整体费用。
具体信息如下：
- 出行日期：{start_date} 到 {end_date}
- 人数：{travelers}人
- 总预算：{budget}元
- 偏好：{', '.join(preferences)}

请提供以下信息：
1. 交通费用预估
2. 住宿费用预估
3. 餐饮费用预估
4. 门票费用预估
5. 其他费用预估（购物、娱乐等）
6. 建议预留的额外费用
7. 省钱建议和攻略"""

                # 获取回复
                response = get_chat_response(
                    prompt=prompt,
                    memory=None,
                    model_type=current_model_key,
                    api_key=st.session_state.api_keys[current_model_key],
                    character_type=None,
                    is_chat_feature=False
                )

                # 保存响应到 session state
                st.session_state.travel_response = response

            except Exception as e:
                st.error(f"生成失败：{str(e)}")
                st.info("💡 请检查输入内容是否完整，或稍后重试")


    def handle_travel_response(response_text: str):
        """处理旅游助手的响应，确保状态保持"""
        if 'travel_response' not in st.session_state:
            st.session_state.travel_response = None

        st.session_state.travel_response = response_text

        st.markdown("### 🎯 规划结果")
        st.write(response_text)

        # 使用新的复制按钮实现
        create_copy_button(
            text=response_text,
            button_text="📋 复制到剪贴板",
            key=f"travel_copy_{hash(response_text)}"
        )


    if generate_btn:
        # ... (保留生成逻辑代码)
        with st.spinner(f"🎯 正在为您规划{destination}之旅..."):
            try:
                # ... (保留现有的生成逻辑)
                response = get_chat_response(
                    prompt=prompt,
                    memory=None,
                    model_type=current_model_key,
                    api_key=st.session_state.api_keys[current_model_key],
                    character_type=None,
                    is_chat_feature=False
                )

                # 保存响应到 session state
                st.session_state.travel_response = response

            except Exception as e:
                st.error(f"生成失败：{str(e)}")
                st.info("💡 请检查输入内容是否完整，或稍后重试")

    # 修改后的显示结果部分
    if st.session_state.travel_response:
        st.markdown("---")
        handle_travel_response(st.session_state.travel_response)
        # 添加AI声明
        st.markdown(f"---\n*此内容为 {model_type} 所生成，仅供参考，请自行着重考量。*", help="AI生成内容可能需要人工审核和修改")

    # 添加提示信息
    with st.expander("💡 使用提示"):
        st.markdown("""
        1. **行程规划**: 输入目的地、日期和预算，获取详细的行程安排
        2. **交通建议**: 获取去往目的地的最佳交通方式和本地交通建议
        3. **住宿推荐**: 根据预算和偏好获取住宿推荐
        4. **美食指南**: 发现当地特色美食和推荐餐厅
        5. **景点介绍**: 了解主要景点信息和门票价格
        6. **天气查询**: 查看目的地天气情况和着装建议
        7. **花费预估**: 获取旅行整体费用预估和省钱建议
        """)

with tabs[3]:
    render_medical_assistant()

with tabs[4]:
    from legal_assistant import render_legal_assistant
    render_legal_assistant()

