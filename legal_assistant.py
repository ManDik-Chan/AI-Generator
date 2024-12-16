import streamlit as st
from utils import (
    extract_text_from_pdf,
    extract_text_from_docx,
    analyze_legal_document,
    get_legal_advice,
    analyze_legal_risk,
    extract_text_from_image
)


def check_glm_access():
    """检查是否可以使用GLM模型"""
    current_model = st.session_state.get('model_select', '')
    is_glm_verified = st.session_state.get('glm_verified', False)

    if current_model != "GLM-4":
        st.error("⚠️ 政法助手功能仅支持GLM模型，请在侧边栏选择GLM-4模型！")
        return False

    if not is_glm_verified:
        st.error("⚠️ 请先在侧边栏验证GLM API密钥！")
        return False

    return True


def create_copy_button(text: str, button_text: str = "📋 复制到剪贴板", key: str = None) -> None:
    """创建复制按钮"""
    if key not in st.session_state:
        st.session_state[key] = False

    if st.button(button_text, key=f"btn_{key}"):
        try:
            import pyperclip
            pyperclip.copy(text)
            st.session_state[key] = True
            st.success('✅ 已复制到剪贴板！', icon="✅")
        except ImportError:
            st.error('请先安装 pyperclip: pip install pyperclip')


def handle_uploaded_image(uploaded_image):
    """处理上传的图片"""
    if not uploaded_image:
        return None

    # 检查是否为新图片
    for existing_image in st.session_state.uploaded_images:
        if (uploaded_image.name == existing_image['name'] and
                uploaded_image.size == existing_image['size']):
            return None

    # 读取图片内容
    image_content = uploaded_image.read()
    # 重置文件指针
    uploaded_image.seek(0)

    try:
        # 使用GLM-4V-Flash模型提取文字
        text = extract_text_from_image(
            image_content=image_content,
            api_key=st.session_state.api_keys.get('glm', '')
        )

        # 保存图片信息和识别文本
        new_image = {
            'name': uploaded_image.name,
            'size': uploaded_image.size,
            'content': uploaded_image,
            'text': text,
            'order': len(st.session_state.uploaded_images)
        }

        return new_image

    except Exception as e:
        st.error(f"处理图片时出错: {str(e)}")
        return None


def render_legal_assistant():
    st.header("⚖️ 政法助手")

    # 检查是否可以使用政法助手
    if not check_glm_access():
        return

    # 初始化session state
    if 'current_tab' not in st.session_state:
        st.session_state.current_tab = 0
    if 'document_text' not in st.session_state:
        st.session_state.document_text = None
    if 'analysis_result' not in st.session_state:
        st.session_state.analysis_result = None
    if 'legal_advice' not in st.session_state:
        st.session_state.legal_advice = None
    if 'risk_analysis' not in st.session_state:
        st.session_state.risk_analysis = None
    if 'uploaded_images' not in st.session_state:
        st.session_state.uploaded_images = []
    if 'image_texts' not in st.session_state:
        st.session_state.image_texts = []

    # 创建选项卡
    tabs = st.tabs(["📄 文档分析", "📝 合同起草", "❓ 法律咨询", "⚠️ 风险评估"])

    # 文档分析标签页
    with tabs[0]:
        st.subheader("文档分析")

        # 上传方式选择
        upload_type = st.radio(
            "选择上传方式",
            ["文档文件", "图片文件"],
            horizontal=True
        )

        if upload_type == "文档文件":
            # 文档文件处理逻辑保持不变
            uploaded_file = st.file_uploader(
                "上传合同或法律文书 (支持PDF、Word格式)",
                type=['pdf', 'docx']
            )
            # ... 原有的文档处理代码 ...

        else:  # 图片文件上传
            # 添加单个图片上传器
            uploaded_image = st.file_uploader(
                "上传合同或法律文书照片 (支持JPG、PNG格式)",
                type=['jpg', 'jpeg', 'png'],
                key="single_image_uploader"
            )

            # 如果有新图片上传，添加到列表中
            if uploaded_image is not None:
                # 检查是否为新图片
                is_new_image = True
                for existing_image in st.session_state.uploaded_images:
                    if (uploaded_image.name == existing_image['name'] and
                            uploaded_image.size == existing_image['size']):
                        is_new_image = False
                        break

                if is_new_image:
                    # 读取图片内容
                    image_content = uploaded_image.read()
                    # 重置文件指针
                    uploaded_image.seek(0)

                    with st.spinner("正在识别图片文字..."):
                        try:
                            # 使用GLM-4V-Flash模型提取文字
                            text = extract_text_from_image(
                                image_content=image_content,
                                api_key=st.session_state.api_keys.get('glm', '')
                            )

                            # 保存图片信息和识别文本
                            st.session_state.uploaded_images.append({
                                'name': uploaded_image.name,
                                'size': uploaded_image.size,
                                'content': uploaded_image,
                                'order': len(st.session_state.uploaded_images)
                            })
                            st.session_state.image_texts.append(text)

                        except Exception as e:
                            st.error(f"处理图片时出错: {str(e)}")

            # 显示已上传的图片和排序控制
            if st.session_state.uploaded_images:
                st.write("### 已上传的图片")

                for idx, image_data in enumerate(st.session_state.uploaded_images):
                    col1, col2, col3, col4 = st.columns([0.2, 1, 2, 0.3])

                    with col1:
                        # 移动按钮
                        if idx > 0:
                            if st.button("↑", key=f"up_{idx}"):
                                st.session_state.uploaded_images[idx], st.session_state.uploaded_images[idx - 1] = \
                                    st.session_state.uploaded_images[idx - 1], st.session_state.uploaded_images[idx]
                                st.session_state.image_texts[idx], st.session_state.image_texts[idx - 1] = \
                                    st.session_state.image_texts[idx - 1], st.session_state.image_texts[idx]
                                st.rerun()

                        if idx < len(st.session_state.uploaded_images) - 1:
                            if st.button("↓", key=f"down_{idx}"):
                                st.session_state.uploaded_images[idx], st.session_state.uploaded_images[idx + 1] = \
                                    st.session_state.uploaded_images[idx + 1], st.session_state.uploaded_images[idx]
                                st.session_state.image_texts[idx], st.session_state.image_texts[idx + 1] = \
                                    st.session_state.image_texts[idx + 1], st.session_state.image_texts[idx]
                                st.rerun()

                    with col2:
                        # 显示图片
                        st.image(image_data['content'], caption=f"图片 {idx + 1}: {image_data['name']}",
                                 use_column_width=True)

                    with col3:
                        # 显示识别的文本
                        with st.expander(f"查看图片 {idx + 1} 识别内容", expanded=False):
                            st.text_area(
                                "识别内容",
                                st.session_state.image_texts[idx],
                                height=150,
                                key=f"text_area_{idx}"
                            )

                    with col4:
                        # 删除按钮
                        if st.button("❌", key=f"delete_{idx}"):
                            st.session_state.uploaded_images.pop(idx)
                            st.session_state.image_texts.pop(idx)
                            st.rerun()

                # 合并所有识别文本
                if st.session_state.image_texts:
                    combined_text = "\n\n".join([
                        f"=== 第{i + 1}页 ===\n{text}"
                        for i, text in enumerate(st.session_state.image_texts)
                    ])
                    st.session_state.document_text = combined_text

                    with st.expander("查看合并后的完整文本"):
                        st.text_area("完整文本", combined_text, height=300)
                        create_copy_button(combined_text, "📋 复制完整文本", "copy_full_text")

                # 清空按钮
                if st.button("清空所有图片", use_container_width=True):
                    st.session_state.uploaded_images = []
                    st.session_state.image_texts = []
                    st.session_state.document_text = None
                    st.rerun()

        # 文档类型选择和分析部分保持不变
        doc_type = st.radio(
            "文档类型",
            ["contract", "legal_document"],
            format_func=lambda x: "合同" if x == "contract" else "法律文书",
            horizontal=True
        )

        # 分析按钮
        if st.button("开始分析", use_container_width=True, disabled=not st.session_state.get('document_text')):
            with st.spinner("正在分析文档..."):
                result = analyze_legal_document(
                    text=st.session_state.document_text,
                    document_type=doc_type,
                    model_type="glm",
                    api_key=st.session_state.api_keys.get('glm', '')
                )

                # 保存分析结果
                st.session_state.analysis_result = result

        # 显示分析结果
        if st.session_state.get('analysis_result'):
            result = st.session_state.analysis_result
            if result['status'] == 'success':
                st.markdown("### 📋 分析结果")
                st.write(result['analysis'])
                create_copy_button(result['analysis'], "📋 复制分析结果", "copy_analysis")
            else:
                st.error(result['message'])

    #合同起草功能
    with tabs[1]:
        from contract_generator import render_contract_generator
        render_contract_generator()

    # 风险评估标签页
    with tabs[2]:
        st.subheader("风险评估")

        scenario = st.text_area(
            "情况描述",
            height=200,
            placeholder="请详细描述需要评估风险的情况...",
            key="risk_scenario"
        )

        if st.button("评估风险", use_container_width=True):
            if not scenario:
                st.warning("请填写情况描述")
            else:
                with st.spinner("正在评估风险..."):
                    result = analyze_legal_risk(
                        scenario=scenario,
                        model_type="glm",
                        api_key=st.session_state.api_keys.get('glm', '')
                    )

                    # 保存评估结果
                    st.session_state.risk_analysis = result

        # 显示风险评估结果
        if st.session_state.get('risk_analysis'):
            result = st.session_state.risk_analysis
            if result['status'] == 'success':
                st.markdown("### ⚠️ 风险评估结果")
                st.write(result['analysis'])
                create_copy_button(result['analysis'], "📋 复制评估结果", "copy_risk")
            else:
                st.error(result['message'])

    # 添加免责声明
    st.markdown("---")
    st.caption("免责声明：本助手提供的分析和建议仅供参考，不构成正式的法律意见。重要法律事务请咨询专业律师。")