import streamlit as st
from typing import Dict, List, Optional
from utils import get_chat_response, create_copy_button
from datetime import datetime


def query_symptoms(symptoms: str, model_type: str, api_key: str) -> Dict:
    """查询症状分析"""
    prompt = f"""请作为一个专业的医生，对以下症状进行分析：
{symptoms}

请从以下几个方面进行详细分析：
1. 可能的疾病：列出最可能的3-5种疾病
2. 建议检查：需要进行的医学检查
3. 就医建议：是否需要及时就医，建议就诊科室
4. 注意事项：需要特别注意的事项
5. 生活建议：日常生活中的注意事项

请注意：这只是初步分析，具体诊断需要医生面诊。"""

    try:
        response = get_chat_response(
            prompt=prompt,
            memory=None,
            model_type=model_type,
            api_key=api_key,
            is_chat_feature=False
        )
        return {'status': 'success', 'analysis': response}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def health_self_check(age: int, gender: str, conditions: List[str], model_type: str, api_key: str) -> Dict:
    """健康自查分析"""
    conditions_text = "\n".join([f"- {condition}" for condition in conditions])
    prompt = f"""请作为一个专业的医生，为以下情况进行健康分析：

基本信息：
- 年龄：{age}岁
- 性别：{gender}
- 症状/状况：
{conditions_text}

请提供以下分析：
1. 健康风险评估
2. 建议进行的体检项目
3. 生活方式建议
4. 预防保健措施
5. 需要注意的健康警示"""

    try:
        response = get_chat_response(
            prompt=prompt,
            memory=None,
            model_type=model_type,
            api_key=api_key,
            is_chat_feature=False
        )
        return {'status': 'success', 'analysis': response}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def suggest_medication(symptoms: str, age: int, allergies: str, model_type: str, api_key: str) -> Dict:
    """药物建议"""
    prompt = f"""请作为一个专业的医生，针对以下情况提供用药建议：

患者情况：
- 年龄：{age}岁
- 症状：{symptoms}
- 过敏史：{allergies if allergies else "无"}

请提供以下建议：
1. 推荐药物类型
2. 用药注意事项
3. 可能的副作用
4. 用药禁忌
5. 建议就医情况

请注意：这只是建议，具体用药需要遵医嘱。"""

    try:
        response = get_chat_response(
            prompt=prompt,
            memory=None,
            model_type=model_type,
            api_key=api_key,
            is_chat_feature=False
        )
        return {'status': 'success', 'advice': response}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def suggest_recovery(condition: str, age: int, model_type: str, api_key: str) -> Dict:
    """康复建议"""
    prompt = f"""请作为一个康复科医生，针对以下情况提供康复建议：

患者情况：
- 年龄：{age}岁
- 症状/情况：{condition}

请提供以下建议：
1. 康复计划
2. 运动建议
3. 生活起居注意事项
4. 康复周期预估
5. 康复效果评估标准
6. 需要注意的事项"""

    try:
        response = get_chat_response(
            prompt=prompt,
            memory=None,
            model_type=model_type,
            api_key=api_key,
            is_chat_feature=False
        )
        return {'status': 'success', 'advice': response}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def suggest_prevention(risk_factors: str, age: int, gender: str, model_type: str, api_key: str) -> Dict:
    """预防建议"""
    prompt = f"""请作为一个预防医学专家，针对以下情况提供预防建议：

个人情况：
- 年龄：{age}岁
- 性别：{gender}
- 风险因素：{risk_factors}

请提供以下建议：
1. 疾病风险评估
2. 预防措施
3. 生活方式建议
4. 定期检查计划
5. 预防保健措施"""

    try:
        response = get_chat_response(
            prompt=prompt,
            memory=None,
            model_type=model_type,
            api_key=api_key,
            is_chat_feature=False
        )
        return {'status': 'success', 'advice': response}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def match_hospital(condition: str, location: str, model_type: str, api_key: str) -> Dict:
    """医院匹配推荐"""
    prompt = f"""请作为一个医疗资源专家，针对以下情况推荐合适的医院：

患者情况：
- 病情：{condition}
- 所在地区：{location}

请提供以下建议：
1. 推荐医院列表（请列出3-5家）
2. 医院特色和优势
3. 就医建议
4. 挂号注意事项
5. 就医准备事项"""

    try:
        response = get_chat_response(
            prompt=prompt,
            memory=None,
            model_type=model_type,
            api_key=api_key,
            is_chat_feature=False
        )
        return {'status': 'success', 'recommendations': response}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def suggest_exercise(condition: str, age: int, fitness_level: str, model_type: str, api_key: str) -> Dict:
    """运动康复建议"""
    prompt = f"""请作为一个运动康复专家，针对以下情况提供运动建议：

个人情况：
- 年龄：{age}岁
- 身体状况：{condition}
- 运动水平：{fitness_level}

请提供以下建议：
1. 建议的运动类型
2. 运动强度和时长
3. 运动注意事项
4. 循序渐进计划
5. 禁忌动作
6. 运动效果评估"""

    try:
        response = get_chat_response(
            prompt=prompt,
            memory=None,
            model_type=model_type,
            api_key=api_key,
            is_chat_feature=False
        )
        return {'status': 'success', 'advice': response}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def render_medical_assistant():
    """渲染医疗助手界面"""
    st.header("👨‍⚕️ AI医疗助手")

    # 获取当前模型信息
    current_model = st.session_state.get('current_model_type')
    is_key_verified = st.session_state.get(f"{current_model}_verified", False)

    if not is_key_verified:
        st.warning("⚠️ 请先在侧边栏验证API密钥")
        return

    # 创建标签页
    tabs = st.tabs([
        "🩺 症状查询",
        "🏥 健康自查",
        "👨‍⚕️ AI医生对话",
        "💊 药物建议",
        "🌟 康复建议",
        "🛡️ 预防建议",
        "🏨 医院匹配",
        "🏃 运动康复"
    ])

    # 症状查询标签页
    with tabs[0]:
        st.subheader("症状查询")

        symptoms = st.text_area(
            "请描述您的症状",
            height=150,
            placeholder="请详细描述您的症状，包括：\n1. 症状的具体表现\n2. 持续时间\n3. 是否有任何诱因\n4. 是否有其他伴随症状"
        )

        if st.button("分析症状", use_container_width=True):
            if not symptoms:
                st.warning("请描述您的症状")
            else:
                with st.spinner("正在分析症状..."):
                    result = query_symptoms(
                        symptoms=symptoms,
                        model_type=current_model,
                        api_key=st.session_state.api_keys[current_model]
                    )

                    if result['status'] == 'success':
                        st.markdown("### 分析结果")
                        st.write(result['analysis'])
                        create_copy_button(
                            text=result['analysis'],
                            button_text="📋 复制分析结果",
                            key=f"copy_symptoms_{hash(result['analysis'])}"
                        )
                    else:
                        st.error(result['message'])

    # 健康自查标签页
    with tabs[1]:
        st.subheader("健康自查")

        col1, col2 = st.columns(2)
        with col1:
            age = st.number_input("年龄", min_value=0, max_value=120, value=30)
        with col2:
            gender = st.selectbox("性别", ["男", "女"])

        health_conditions = st.multiselect(
            "请选择您的症状或状况（可多选）",
            [
                "经常感觉疲劳", "睡眠质量差", "容易感冒", "胃部不适",
                "关节疼痛", "头痛", "心悸", "呼吸困难",
                "皮肤问题", "视力问题", "体重异常", "情绪问题"
            ]
        )

        if st.button("开始自查", use_container_width=True):
            if not health_conditions:
                st.warning("请选择至少一个症状或状况")
            else:
                with st.spinner("正在分析..."):
                    result = health_self_check(
                        age=age,
                        gender=gender,
                        conditions=health_conditions,
                        model_type=current_model,
                        api_key=st.session_state.api_keys[current_model]
                    )

                    if result['status'] == 'success':
                        st.markdown("### 分析结果")
                        st.write(result['analysis'])
                        create_copy_button(
                            text=result['analysis'],
                            button_text="📋 复制分析结果",
                            key=f"copy_health_{hash(result['analysis'])}"
                        )
                    else:
                        st.error(result['message'])

    # AI医生对话标签页
    with tabs[2]:
        st.subheader("AI医生对话")

        # 初始化会话管理的session state
        if 'doctor_conversations' not in st.session_state:
            st.session_state.doctor_conversations = {}
        if 'current_conversation_id' not in st.session_state:
            st.session_state.current_conversation_id = None
        if 'conversation_counter' not in st.session_state:
            st.session_state.conversation_counter = 0

        # 会话管理控件
        col1, col2, col3 = st.columns([2, 1, 1])

        with col1:
            # 会话选择下拉框
            conversations = list(st.session_state.doctor_conversations.keys())
            if conversations:
                selected_conversation = st.selectbox(
                    "选择对话",
                    conversations,
                    index=conversations.index(
                        st.session_state.current_conversation_id) if st.session_state.current_conversation_id in conversations else 0
                )
            else:
                selected_conversation = None

        with col2:
            # 新建会话按钮
            if st.button("新建对话", use_container_width=True):
                conversation_id = f"对话 {st.session_state.conversation_counter + 1}"
                st.session_state.doctor_conversations[conversation_id] = {
                    'messages': [],
                    'summary': '',
                    'created_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                st.session_state.current_conversation_id = conversation_id
                st.session_state.conversation_counter += 1
                st.rerun()

        with col3:
            # 删除当前会话按钮
            if st.button("删除对话", use_container_width=True) and selected_conversation:
                if selected_conversation in st.session_state.doctor_conversations:
                    del st.session_state.doctor_conversations[selected_conversation]
                    if not st.session_state.doctor_conversations:
                        st.session_state.current_conversation_id = None
                    else:
                        st.session_state.current_conversation_id = list(st.session_state.doctor_conversations.keys())[0]
                    st.rerun()

        # 如果没有任何会话，创建第一个会话
        if not st.session_state.doctor_conversations:
            conversation_id = "对话 1"
            st.session_state.doctor_conversations[conversation_id] = {
                'messages': [],
                'summary': '',
                'created_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            st.session_state.current_conversation_id = conversation_id
            st.session_state.conversation_counter = 1
            st.rerun()

        # 更新当前会话ID
        if selected_conversation:
            st.session_state.current_conversation_id = selected_conversation

        # 显示当前会话的消息
        if st.session_state.current_conversation_id:
            current_conv = st.session_state.doctor_conversations[st.session_state.current_conversation_id]

            # 显示对话历史
            for message in current_conv['messages']:
                if message["role"] == "user":
                    st.markdown(f"**👤 您**：\n{message['content']}")
                    st.markdown("---")
                else:
                    st.markdown(f"**👨‍⚕️ AI医生**：\n{message['content']}")
                    st.markdown("---")

            # 显示对话总结（如果有）
            if current_conv['summary']:
                with st.expander("查看病情总结", expanded=False):
                    st.write(current_conv['summary'])

            # 用户输入区
            user_input = st.text_input(
                "请输入您想咨询的问题...",
                key=f"user_input_{st.session_state.current_conversation_id}",
                value=""  # 确保每次重新运行时输入框都是空的
            )

            if 'last_input' not in st.session_state:
                st.session_state.last_input = ""

            col1, col2 = st.columns(2)
            with col1:
                # 发送按钮
                if st.button("发送", use_container_width=True):
                    if user_input and user_input != st.session_state.last_input:
                        # 记录这次的输入
                        st.session_state.last_input = user_input
                        # 添加用户消息
                        current_conv['messages'].append({
                            "role": "user",
                            "content": user_input
                        })

                        # 构建完整的对话历史上下文
                        conversation_history = "\n".join([
                            f"{'患者' if msg['role'] == 'user' else 'AI医生'}: {msg['content']}"
                            for msg in current_conv['messages']
                        ])

                        # 构建医生角色提示词
                        prompt = f"""作为一个专业、富有同理心的AI医生，请基于以下对话历史，回复患者的问题。请注意：
1. 保持专业、准确，但语言要平易近人
2. 结合之前的对话内容，给出更有针对性的建议
3. 必要时建议就医
4. 不做确定性诊断
5. 对患者表示理解和关心

对话历史：
{conversation_history}

请针对患者最新的问题给出回复。"""

                        with st.spinner("AI医生正在回复..."):
                            try:
                                response = get_chat_response(
                                    prompt=prompt,
                                    memory=None,
                                    model_type=current_model,
                                    api_key=st.session_state.api_keys[current_model],
                                    is_chat_feature=True
                                )

                                # 添加AI回复
                                current_conv['messages'].append({
                                    "role": "assistant",
                                    "content": response
                                })

                                # 生成对话总结
                                if len(current_conv['messages']) >= 4:  # 当有足够的对话内容时生成总结
                                    summary_prompt = f"""请根据以下医生和患者的对话，总结患者的主要症状、关键信息和建议：

{conversation_history}

请从以下几个方面进行总结：
1. 主要症状
2. 可能的原因
3. 关键建议
4. 需要注意的事项"""

                                    summary = get_chat_response(
                                        prompt=summary_prompt,
                                        memory=None,
                                        model_type=current_model,
                                        api_key=st.session_state.api_keys[current_model],
                                        is_chat_feature=False
                                    )
                                    current_conv['summary'] = summary

                                st.rerun()

                            except Exception as e:
                                st.error(f"获取回复失败: {str(e)}")

            with col2:
                # 清空当前对话按钮
                if st.button("清空当前对话", use_container_width=True):
                    current_conv['messages'] = []
                    current_conv['summary'] = ''
                    st.rerun()

            # 复制对话记录按钮
            if current_conv['messages']:
                conversation_text = "\n".join([
                    f"{'患者' if msg['role'] == 'user' else 'AI医生'}: {msg['content']}"
                    for msg in current_conv['messages']
                ])

                if current_conv['summary']:
                    conversation_text += f"\n\n病情总结：\n{current_conv['summary']}"

                create_copy_button(
                    text=conversation_text,
                    button_text="📋 复制对话记录",
                    key=f"copy_conversation_{st.session_state.current_conversation_id}"
                )

    # 药物建议标签页
    with tabs[3]:
        st.subheader("药物建议")

        med_symptoms = st.text_area(
            "症状描述",
            height=100,
            placeholder="请描述您的症状..."
        )

        col1, col2 = st.columns(2)
        with col1:
            med_age = st.number_input("年龄", min_value=0, max_value=120, value=30, key="med_age")
        with col2:
            allergies = st.text_input("过敏史（如无可不填）", placeholder="请输入过敏史...")

        if st.button("获取用药建议", use_container_width=True):
            if not med_symptoms:
                st.warning("请描述您的症状")
            else:
                with st.spinner("正在分析..."):
                    result = suggest_medication(
                        symptoms=med_symptoms,
                        age=med_age,
                        allergies=allergies,
                        model_type=current_model,
                        api_key=st.session_state.api_keys[current_model]
                    )

                    if result['status'] == 'success':
                        st.markdown("### 用药建议")
                        st.write(result['advice'])
                        create_copy_button(
                            text=result['advice'],
                            button_text="📋 复制用药建议",
                            key=f"copy_medication_{hash(result['advice'])}"
                        )
                    else:
                        st.error(result['message'])

    # 康复建议标签页
    with tabs[4]:
        st.subheader("康复建议")

        recovery_condition = st.text_area(
            "症状/情况描述",
            height=100,
            placeholder="请描述您需要康复的症状或情况..."
        )

        recovery_age = st.number_input("年龄", min_value=0, max_value=120, value=30, key="recovery_age")

        if st.button("获取康复建议", use_container_width=True):
            if not recovery_condition:
                st.warning("请描述您的症状或情况")
            else:
                with st.spinner("正在生成康复建议..."):
                    result = suggest_recovery(
                        condition=recovery_condition,
                        age=recovery_age,
                        model_type=current_model,
                        api_key=st.session_state.api_keys[current_model]
                    )

                    if result['status'] == 'success':
                        st.markdown("### 康复建议")
                        st.write(result['advice'])
                        create_copy_button(
                            text=result['advice'],
                            button_text="📋 复制康复建议",
                            key=f"copy_recovery_{hash(result['advice'])}"
                        )
                    else:
                        st.error(result['message'])

    # 预防建议标签页
    with tabs[5]:
        st.subheader("预防建议")

        col1, col2 = st.columns(2)
        with col1:
            prev_age = st.number_input("年龄", min_value=0, max_value=120, value=30, key="prev_age")
        with col2:
            prev_gender = st.selectbox("性别", ["男", "女"], key="prev_gender")

        risk_factors = st.multiselect(
            "请选择您的风险因素（可多选）",
            [
                "高血压家族史", "糖尿病家族史", "心脏病家族史",
                "吸烟", "饮酒", "缺乏运动", "作息不规律",
                "工作压力大", "饮食不规律", "体重超标"
            ],
            key="risk_factors"
        )

        if st.button("获取预防建议", use_container_width=True):
            if not risk_factors:
                st.warning("请选择至少一个风险因素")
            else:
                with st.spinner("正在生成预防建议..."):
                    result = suggest_prevention(
                        risk_factors=", ".join(risk_factors),
                        age=prev_age,
                        gender=prev_gender,
                        model_type=current_model,
                        api_key=st.session_state.api_keys[current_model]
                    )

                    if result['status'] == 'success':
                        st.markdown("### 预防建议")
                        st.write(result['advice'])
                        create_copy_button(
                            text=result['advice'],
                            button_text="📋 复制预防建议",
                            key=f"copy_prevention_{hash(result['advice'])}"
                        )
                    else:
                        st.error(result['message'])

    # 医院匹配标签页
    with tabs[6]:
        st.subheader("医院匹配")

        hospital_condition = st.text_area(
            "病情描述",
            height=100,
            placeholder="请描述您的病情或需要就医的情况..."
        )

        location = st.text_input("所在地区（省市）", placeholder="例如：北京市海淀区")

        if st.button("查找医院", use_container_width=True):
            if not hospital_condition or not location:
                st.warning("请填写完整的病情描述和地区信息")
            else:
                with st.spinner("正在查找适合的医院..."):
                    result = match_hospital(
                        condition=hospital_condition,
                        location=location,
                        model_type=current_model,
                        api_key=st.session_state.api_keys[current_model]
                    )

                    if result['status'] == 'success':
                        st.markdown("### 医院推荐")
                        st.write(result['recommendations'])
                        create_copy_button(
                            text=result['recommendations'],
                            button_text="📋 复制医院推荐",
                            key=f"copy_hospital_{hash(result['recommendations'])}"
                        )
                    else:
                        st.error(result['message'])

    # 运动康复标签页
    with tabs[7]:
        st.subheader("运动康复")

        exercise_condition = st.text_area(
            "身体状况描述",
            height=100,
            placeholder="请描述您的身体状况、受伤情况或需要运动康复的原因..."
        )

        col1, col2 = st.columns(2)
        with col1:
            exercise_age = st.number_input("年龄", min_value=0, max_value=120, value=30, key="exercise_age")
        with col2:
            fitness_level = st.select_slider(
                "运动水平",
                options=["零基础", "初级", "中级", "高级"],
                value="初级"
            )

        if st.button("获取运动建议", use_container_width=True):
            if not exercise_condition:
                st.warning("请描述您的身体状况")
            else:
                with st.spinner("正在生成运动建议..."):
                    result = suggest_exercise(
                        condition=exercise_condition,
                        age=exercise_age,
                        fitness_level=fitness_level,
                        model_type=current_model,
                        api_key=st.session_state.api_keys[current_model]
                    )

                    if result['status'] == 'success':
                        st.markdown("### 运动建议")
                        st.write(result['advice'])
                        create_copy_button(
                            text=result['advice'],
                            button_text="📋 复制运动建议",
                            key=f"copy_exercise_{hash(result['advice'])}"
                        )
                    else:
                        st.error(result['message'])

    # 添加免责声明
    st.markdown("---")
    st.caption("免责声明：本AI医疗助手提供的建议仅供参考，不构成医疗诊断或处方。如有严重症状，请及时就医。")