import streamlit as st
from typing import Dict, List
from utils import _get_glm_response
from contract_templates import CONTRACT_TEMPLATES, get_prompt_for_contract
from utils import create_copy_button

def generate_contract(template_type: str, details: Dict, api_key: str) -> Dict:
    """生成合同内容"""
    try:
        # 构建提示词
        prompt = get_prompt_for_contract(template_type, details)

        # 获取AI响应
        contract_text = _get_glm_response(prompt, api_key)

        return {
            'status': 'success',
            'contract': contract_text
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': f"合同生成失败: {str(e)}"
        }


def render_contract_generator():
    """渲染合同生成器界面"""
    st.subheader("📝 合同起草")

    # 选择合同类型
    template_options = list(CONTRACT_TEMPLATES.keys()) + ["自定义合同"]
    selected_template = st.selectbox(
        "选择合同类型",
        template_options,
        help="选择预设的合同模板或自定义合同"
    )

    # 用于存储合同详情的字典
    contract_details = {}

    if selected_template == "自定义合同":
        # 自定义合同输入
        st.write("请描述您需要的合同详情：")

        contract_name = st.text_input("合同名称", placeholder="例如：技术服务合同")
        contract_details["合同名称"] = contract_name

        contract_parties = st.text_area(
            "合同双方信息",
            placeholder="请描述合同双方的基本信息，包括名称、地址、联系方式等"
        )
        contract_details["合同双方信息"] = contract_parties

        contract_content = st.text_area(
            "合同主要内容",
            placeholder="请详细描述合同的主要内容，包括权利义务、时间期限、金额等关键信息"
        )
        contract_details["合同主要内容"] = contract_content

        special_terms = st.text_area(
            "特殊约定（选填）",
            placeholder="如有特殊约定或要求，请在此说明"
        )
        if special_terms:
            contract_details["特殊约定"] = special_terms

    else:
        # 使用预设模板
        template = CONTRACT_TEMPLATES[selected_template]
        st.write(f"请填写{template['name']}的详细信息：")

        # 遍历模板字段生成输入框
        for field, default in template['fields'].items():
            if isinstance(default, list):
                # 多选项字段
                selected_values = st.multiselect(
                    field,
                    default,
                    help=f"选择适用的{field}"
                )
                contract_details[field] = selected_values
            else:
                # 文本输入字段
                value = st.text_input(
                    field,
                    placeholder=f"请输入{field}"
                )
                contract_details[field] = value

    # 生成按钮
    if st.button("生成合同", use_container_width=True):
        if not st.session_state.get("glm_verified", False):
            st.warning("⚠️ 请先在侧边栏验证GLM API密钥")
            return

        # 验证必填字段
        empty_fields = [k for k, v in contract_details.items() if not v]
        if empty_fields:
            st.warning(f"请填写以下必填信息：{', '.join(empty_fields)}")
            return

        with st.spinner("正在生成合同..."):
            result = generate_contract(
                template_type=selected_template,
                details=contract_details,
                api_key=st.session_state.api_keys.get('glm', '')
            )

            if result['status'] == 'success':
                # 保存到session state
                st.session_state.generated_contract = result['contract']

                # 显示生成的合同
                st.markdown("### 📄 生成的合同")
                st.write(st.session_state.generated_contract)

                # 使用create_copy_button函数进行复制
                create_copy_button(
                    text=st.session_state.generated_contract,
                    button_text="📋 复制合同文本",
                    key="copy_contract_btn"
                )
            else:
                st.error(result['message'])

        # 如果session state中有已生成的合同,也显示出来
    elif 'generated_contract' in st.session_state:
        st.markdown("### 📄 生成的合同")
        st.write(st.session_state.generated_contract)

        # 使用create_copy_button函数进行复制
        create_copy_button(
            text=st.session_state.generated_contract,
            button_text="📋 复制合同文本",
            key="copy_contract_btn"
        )

    # 添加提示信息
    with st.expander("💡 使用提示"):
        st.markdown("""
        1. 选择合适的合同类型：
           - 房屋租赁：适用于房屋出租、承租
           - 劳动合同：适用于企业与员工签订劳动关系
           - 购销合同：适用于商品买卖交易
           - 二手车买卖：适用于二手车交易过户
           - 自定义合同：可根据特定需求自行设计

        2. 填写注意事项：
           - 必填字段不能为空
           - 金额相关信息请填写具体数字
           - 时间期限请明确起止时间
           - 车辆信息需如实填写
           - 车况状况要详细说明
           - 特殊约定请尽可能详细说明

        3. 使用建议：
           - 生成的合同仅供参考，建议由专业人士审核
           - 重要合同建议寻求法律顾问协助
           - 合同签署前请仔细阅读所有条款
           - 二手车交易时建议核实车辆信息
           - 过户前确认车辆是否存在抵押、违章等""")