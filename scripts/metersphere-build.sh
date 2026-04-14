#!/usr/bin/env bash

# ============================================================================
# MeterSphere 模块化打包脚本
# 支持指定模块打包、每服务独立版本、并行构建、错误处理
# ============================================================================

set -euo pipefail

# ============================================================================
# 配置区域
# ============================================================================

# 项目路径 — 优先使用环境变量（由控制面板传入），不再从脚本位置推测
PROJECT_PATH=${PROJECT_PATH:-""}
if [ -z "$PROJECT_PATH" ]; then
    echo "[ERROR] PROJECT_PATH 未设置，请通过控制面板或环境变量传入"
    exit 1
fi

# 镜像仓库地址
REGISTRY=${REGISTRY:-"registry.fit2cloud.com/north"}

# 打包输出路径
PACKAGE_PATH=${PACKAGE_PATH:-"$HOME/Desktop/metersphere-$(date +%y%m%d).tar"}

# 是否跳过 Maven 依赖安装
SKIP_INIT=${SKIP_INIT:-false}

# 是否并行构建
PARALLEL_BUILD=${PARALLEL_BUILD:-false}

# 并行任务数
MAX_JOBS=${MAX_JOBS:-4}

# 是否只构建镜像不保存 tar
BUILD_ONLY=${BUILD_ONLY:-false}

# 是否不使用缓存构建 Docker 镜像
NO_CACHE=${NO_CACHE:-false}

# Maven 额外选项
MAVEN_OPTS=${MAVEN_OPTS:-""}

# ============================================================================
# 颜色输出
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================================
# 日志函数
# ============================================================================

log_info()    { echo -e "${BLUE}[INFO]${NC}    $(date '+%H:%M:%S') - $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $(date '+%H:%M:%S') - $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $(date '+%H:%M:%S') - $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $(date '+%H:%M:%S') - $1"; }
log_step()    { echo -e "${CYAN}[STEP]${NC}    $(date '+%H:%M:%S') - $1"; }

# ============================================================================
# 模块定义
# ============================================================================

# 支持通过环境变量 MODULE_LIST 动态传入模块列表
# 格式: "module1:path1,module2:path2,..."
# 如果未设置则使用下方默认值
if [ -n "${MODULE_LIST:-}" ]; then
    declare -A MODULES=()
    declare -A SIMPLE_MODULES=()
    BUILD_ORDER=()
    IFS=',' read -ra MODULE_ENTRIES <<< "$MODULE_LIST"
    for entry in "${MODULE_ENTRIES[@]}"; do
        name="${entry%%:*}"
        mpath="${entry#*:}"
        MODULES["$name"]="$mpath"
        BUILD_ORDER+=("$name")
    done
    # SIMPLE_MODULES 通过环境变量传入，格式: "gateway,eureka"
    if [ -n "${SIMPLE_MODULE_LIST:-}" ]; then
        IFS=',' read -ra SIMPLE_ENTRIES <<< "$SIMPLE_MODULE_LIST"
        for name in "${SIMPLE_ENTRIES[@]}"; do
            SIMPLE_MODULES["$name"]=1
        done
    fi
else
    declare -A MODULES=(
        ["gateway"]="framework/gateway"
        ["eureka"]="framework/eureka"
        ["test-track"]="test-track"
        ["api-test"]="api-test"
        ["performance-test"]="performance-test"
        ["project-management"]="project-management"
        ["report-stat"]="report-stat"
        ["system-setting"]="system-setting"
        ["workstation"]="workstation"
    )

    # 没有 backend 子目录的模块（直接在模块根目录构建 Docker 镜像）
    declare -A SIMPLE_MODULES=(
        ["gateway"]=1
        ["eureka"]=1
    )

    # 构建顺序：先框架，再服务
    BUILD_ORDER=("eureka" "gateway" "system-setting" "project-management" "performance-test" "api-test" "test-track" "report-stat" "workstation")
fi

BUILT_IMAGES=()
FAILED_MODULES=()

# 临时文件目录（并行构建用）
TMP_DIR=""

cleanup_tmp() {
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi
}
trap cleanup_tmp EXIT

# ============================================================================
# 辅助函数
# ============================================================================

# 获取模块的实际版本号
get_module_version() {
    local module_name="$1"
    local env_key="SERVICE_VERSION_$(echo "$module_name" | tr '[:lower:]-' '[:upper:]_')"
    echo "${!env_key:-}"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 未安装，请先安装 $1"
        exit 1
    fi
}

# 检查环境
check_environment() {
    log_step "检查构建环境"
    check_command "mvn"
    check_command "docker"
    check_command "java"

    # 检查 Java 版本
    local java_version
    java_version=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
    if [ "$java_version" -lt 17 ]; then
        log_error "需要 JDK 17+，当前版本: $java_version"
        exit 1
    fi

    # 检查项目路径
    if [ ! -d "$PROJECT_PATH" ]; then
        log_error "项目路径不存在: $PROJECT_PATH"
        log_error "请设置 PROJECT_PATH 环境变量或确保脚本位于项目 打包/ 目录下"
        exit 1
    fi

    # 检查 mvnw
    if [ ! -f "$PROJECT_PATH/mvnw" ]; then
        log_warn "未找到 mvnw，将使用系统 mvn"
    fi

    # 检查每服务版本配置
    local missing_versions=()
    for module in "${BUILD_ORDER[@]}"; do
        if [ -z "$(get_module_version "$module")" ]; then
            missing_versions+=("$module")
        fi
    done
    if [ ${#missing_versions[@]} -gt 0 ]; then
        log_warn "以下模块未设置 SERVICE_VERSION_* 环境变量，构建时需要通过控制面板传入："
        for m in "${missing_versions[@]}"; do
            local env_key="SERVICE_VERSION_$(echo "$m" | tr '[:lower:]-' '[:upper:]_')"
            log_warn "  - $m → 请设置 $env_key"
        done
    fi

    log_success "环境检查通过 (JDK $java_version, Docker $(docker --version | awk '{print $3}' | tr -d ','))"
}

# 显示帮助信息
show_help() {
    local _script="$(basename "$0")"
    cat << EOF
用法: $_script [选项] [模块...]

选项:
    -h, --help              显示此帮助信息
    -a, --all               构建所有模块
    -l, --list              列出所有可用模块
    -o, --output PATH       指定输出 tar 文件路径
    -p, --parallel          启用并行构建
    -j, --jobs N            并行任务数(默认: ${MAX_JOBS:-4})
    -s, --skip-init         跳过 Maven 依赖初始化
    -b, --build-only        只构建镜像，不导出 tar 文件
    --no-cache              不使用 Docker 构建缓存
    --registry URL          指定镜像仓库地址(默认: ${REGISTRY:-registry.fit2cloud.com/north})

模块:
    gateway                 网关服务
    eureka                  注册中心
    test-track              测试跟踪
    api-test                API 测试
    performance-test        性能测试
    project-management      项目管理
    report-stat             报告统计
    system-setting          系统设置
    workstation             工作台

示例:
    # 构建所有模块
    $_script -a

    # 构建指定模块
    $_script gateway eureka test-track

    # 并行构建所有模块
    $_script -a -p -j 4

    # 只构建镜像不导出
    $_script -a -b

    # 通过环境变量指定每服务版本
    SERVICE_VERSION_API_TEST=v2.10.26.05-lts SERVICE_VERSION_EUREKA=v2.10.26.01-lts $_script api-test eureka

环境变量:
    PROJECT_PATH            项目路径（默认: 自动探测）
    REGISTRY                镜像仓库地址
    PACKAGE_PATH            输出 tar 文件路径
    SKIP_INIT               跳过初始化（true/false）
    PARALLEL_BUILD          并行构建（true/false）
    MAX_JOBS                并行任务数
    BUILD_ONLY              只构建不导出（true/false）
    NO_CACHE                不使用 Docker 缓存（true/false）
    SERVICE_VERSION_<MOD>   每服务独立镜像版本（MOD 名大写，- 替换为 _）
                            例如: SERVICE_VERSION_API_TEST=v2.10.26.05-lts

EOF
}

# 列出所有模块
list_modules() {
    log_info "可用模块列表:"
    echo ""
    printf "%-25s %-30s %s\n" "模块名称" "路径" "当前版本"
    printf "%-25s %-30s %s\n" "--------" "----" "--------"
    for module in "${BUILD_ORDER[@]}"; do
        local version="$(get_module_version "$module")"
        printf "%-25s %-30s %s\n" "$module" "${MODULES[$module]}" "${version:--}"
    done
    echo ""
}

# ============================================================================
# 核心构建函数
# ============================================================================

# 初始化项目依赖
init_dependencies() {
    if [ "$SKIP_INIT" = true ]; then
        log_warn "跳过依赖初始化"
        return 0
    fi

    log_step "初始化项目依赖"
    cd "$PROJECT_PATH"

    # 安装父 POM
    log_info "安装父 POM..."
    if ! mvn install -N -q; then
        log_error "父 POM 安装失败"
        return 1
    fi

    # 编译核心框架模块
    log_info "编译核心框架模块 (framework + sdk-parent)..."
    if ! mvn clean install -pl framework,framework/sdk-parent,framework/sdk-parent/domain,framework/sdk-parent/sdk,framework/sdk-parent/xpack-interface,framework/sdk-parent/jmeter -q; then
        log_error "核心框架模块编译失败"
        return 1
    fi

    log_success "依赖初始化完成"
}

# 构建单个模块
build_module() {
    local module_name="$1"
    local module_path="${MODULES[$module_name]:-}"

    if [ -z "$module_path" ]; then
        log_error "未知模块: $module_name"
        return 1
    fi

    # 获取版本：优先 SERVICE_VERSION_<MOD>，否则报错
    local module_version="$(get_module_version "$module_name")"
    if [ -z "$module_version" ]; then
        log_error "[$module_name] 未设置镜像版本，请设置环境变量 SERVICE_VERSION_$(echo "$module_name" | tr '[:lower:]-' '[:upper:]_') 或通过控制面板传入"
        return 1
    fi
    local image_name="${REGISTRY}/${module_name}:${module_version}"

    log_step "[$module_name] 开始构建 (版本: $module_version)"

    # 进入模块目录
    cd "${PROJECT_PATH}/${module_path}"

    # Maven 编译
    log_info "[$module_name] Maven 编译..."
    if ! mvn clean install -DskipTests ${MAVEN_OPTS} -q; then
        log_error "[$module_name] Maven 编译失败"
        return 1
    fi
    log_success "[$module_name] Maven 编译完成"

    # 解压依赖
    log_info "[$module_name] 解压 JAR 依赖..."
    if [ -n "${SIMPLE_MODULES[$module_name]:-}" ]; then
        mkdir -p target/dependency
        (cd target/dependency && jar -xf ../*.jar)
    else
        mkdir -p backend/target/dependency
        (cd backend/target/dependency && jar -xf ../*.jar)
    fi

    # Docker 构建参数
    local docker_build_opts=()
    docker_build_opts+=(--build-arg MS_VERSION="${module_version}")
    if [ "$NO_CACHE" = true ]; then
        docker_build_opts+=(--no-cache)
    fi

    # 构建 Docker 镜像
    log_info "[$module_name] 构建 Docker 镜像..."
    if [ -n "${SIMPLE_MODULES[$module_name]:-}" ]; then
        if ! docker build "${docker_build_opts[@]}" -t "${image_name}" .; then
            log_error "[$module_name] Docker 镜像构建失败"
            return 1
        fi
    else
        cd "$PROJECT_PATH"
        if ! docker build "${docker_build_opts[@]}" -t "${image_name}" -f "${module_path}/Dockerfile" .; then
            log_error "[$module_name] Docker 镜像构建失败"
            return 1
        fi
    fi

    # 记录构建结果
    BUILT_IMAGES+=("$image_name")
    # 并行构建时落盘，供父进程汇总
    if [ -n "$TMP_DIR" ]; then
        echo "$image_name" > "${TMP_DIR}/${module_name}.image"
    fi

    log_success "[$module_name] 构建完成: $image_name"
    return 0
}

# 并行构建模块
build_modules_parallel() {
    local modules=("$@")
    local pids=()
    local failed=()
    declare -A PID_TO_MODULE=()

    # 初始化临时目录
    TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ms-build.XXXXXX")

    log_step "并行构建 ${#modules[@]} 个模块(最大并行数: $MAX_JOBS)"

    local running=0
    local index=0

    while [ $index -lt ${#modules[@]} ] || [ ${#pids[@]} -gt 0 ]; do
        # 启动新任务
        while [ $running -lt $MAX_JOBS ] && [ $index -lt ${#modules[@]} ]; do
            local module="${modules[$index]}"
            log_info "启动构建任务: $module"

            # 子 shell 中构建，输出直接继承主进程（实时日志）
            (
                build_module "$module"
                echo $? > "${TMP_DIR}/${module}.status"
            ) &

            pids+=($!)
            PID_TO_MODULE[$!]="$module"
            ((running++))
            ((index++))
        done

        # 等待任意一个任务完成
        if [ ${#pids[@]} -gt 0 ]; then
            wait -n 2>/dev/null || true
            # 检查完成的任务
            for i in "${!pids[@]}"; do
                if ! kill -0 "${pids[$i]}" 2>/dev/null; then
                    local pid="${pids[$i]}"
                    local module="${PID_TO_MODULE[$pid]}"

                    if [ -f "${TMP_DIR}/${module}.status" ]; then
                        local status
                        status=$(cat "${TMP_DIR}/${module}.status")
                        if [ "$status" -ne 0 ]; then
                            failed+=("$module")
                            log_error "模块构建失败: $module (日志: ${TMP_DIR}/${module}.log)"
                        else
                            log_success "模块构建成功: $module"
                        fi
                        rm -f "${TMP_DIR}/${module}.status"
                    fi

                    unset 'pids[$i]'
                    ((running--))
                fi
            done
            pids=("${pids[@]}")
        fi
    done

    # 汇总镜像列表
    for module in "${modules[@]}"; do
        if [ -f "${TMP_DIR}/${module}.image" ]; then
            BUILT_IMAGES+=("$(cat "${TMP_DIR}/${module}.image")")
            rm -f "${TMP_DIR}/${module}.image"
        fi
    done

    if [ ${#failed[@]} -gt 0 ]; then
        FAILED_MODULES+=("${failed[@]}")
        log_error "以下模块构建失败: ${failed[*]}"
        return 1
    fi

    log_success "所有模块并行构建完成"
    return 0
}

# 串行构建模块
build_modules_serial() {
    local modules=("$@")
    local failed=()

    log_step "串行构建 ${#modules[@]} 个模块"

    for module in "${modules[@]}"; do
        if ! build_module "$module"; then
            failed+=("$module")
        fi
    done

    if [ ${#failed[@]} -gt 0 ]; then
        FAILED_MODULES+=("${failed[@]}")
        log_error "以下模块构建失败: ${failed[*]}"
        return 1
    fi

    log_success "所有模块串行构建完成"
    return 0
}

# 导出镜像
export_images() {
    if [ "$BUILD_ONLY" = true ]; then
        log_warn "跳过镜像导出（BUILD_ONLY=true）"
        return 0
    fi

    if [ ${#BUILT_IMAGES[@]} -eq 0 ]; then
        log_warn "没有构建的镜像需要导出"
        return 0
    fi

    # 确保输出目录存在
    local output_dir
    output_dir="$(dirname "$PACKAGE_PATH")"
    if [ ! -d "$output_dir" ]; then
        log_info "创建输出目录: $output_dir"
        mkdir -p "$output_dir" || { log_error "无法创建输出目录: $output_dir"; return 1; }
    fi

    log_step "导出 ${#BUILT_IMAGES[@]} 个镜像到: $PACKAGE_PATH"

    # 检查磁盘空间
    local available_kb
    available_kb=$(df -k "$output_dir" 2>/dev/null | tail -1 | awk '{print $4}')
    available_kb=${available_kb:-0}
    local available_gb=$((available_kb / 1024 / 1024))
    if [ "$available_gb" -lt 10 ]; then
        log_warn "磁盘空间可能不足（可用: ${available_gb}GB，建议 ≥10GB）"
    fi

    # 导出镜像
    if docker save "${BUILT_IMAGES[@]}" -o "$PACKAGE_PATH"; then
        local file_size
        file_size=$(du -h "$PACKAGE_PATH" | cut -f1)
        log_success "镜像导出完成: $PACKAGE_PATH (大小: $file_size)"

        log_info "已导出的镜像:"
        for image in "${BUILT_IMAGES[@]}"; do
            echo "  - $image"
        done
    else
        log_error "镜像导出失败"
        return 1
    fi
}

# 显示构建总结
show_summary() {
    local start_time="$1"
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))

    echo ""
    log_info "=========================================="
    if [ ${#FAILED_MODULES[@]} -eq 0 ]; then
        log_success "构建完成！"
    else
        log_warn "构建完成（有 ${#FAILED_MODULES[@]} 个模块失败）"
    fi
    log_info "=========================================="
    log_info "构建时间: ${minutes}分${seconds}秒"
    log_info "构建模块数: ${#modules_to_build[@]}"
    log_info "成功镜像数: ${#BUILT_IMAGES[@]}"
    if [ ${#FAILED_MODULES[@]} -gt 0 ]; then
        log_info "失败模块数: ${#FAILED_MODULES[@]} (${FAILED_MODULES[*]})"
    fi
    [ "$BUILD_ONLY" = false ] && [ ${#BUILT_IMAGES[@]} -gt 0 ] && log_info "导出文件: $PACKAGE_PATH"
    log_info "=========================================="
    echo ""

    if [ "$BUILD_ONLY" = false ] && [ ${#BUILT_IMAGES[@]} -gt 0 ]; then
        echo "后续操作:"
        echo "  1. 在其他机器上加载镜像:"
        echo "     docker load -i $PACKAGE_PATH"
        echo ""
        echo "  2. 查看已导出的镜像:"
        echo "     docker images | grep $REGISTRY"
        echo ""
    fi
}

# ============================================================================
# 主函数
# ============================================================================

main() {
    local build_all=false
    local modules_to_build=()

    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -a|--all)
                build_all=true
                shift
                ;;
            -l|--list)
                list_modules
                exit 0
                ;;
            -o|--output)
                PACKAGE_PATH="$2"
                shift 2
                ;;
            -p|--parallel)
                PARALLEL_BUILD=true
                shift
                ;;
            -j|--jobs)
                MAX_JOBS="$2"
                shift 2
                ;;
            -s|--skip-init)
                SKIP_INIT=true
                shift
                ;;
            -b|--build-only)
                BUILD_ONLY=true
                shift
                ;;
            --no-cache)
                NO_CACHE=true
                shift
                ;;
            --registry)
                REGISTRY="$2"
                shift 2
                ;;
            -*)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
            *)
                if [ -n "${MODULES[$1]:-}" ]; then
                    modules_to_build+=("$1")
                else
                    log_error "未知模块: $1"
                    log_error "可用模块: ${BUILD_ORDER[*]}"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # 确定要构建的模块（按预定义顺序）
    if [ "$build_all" = true ] || [ ${#modules_to_build[@]} -eq 0 ]; then
        modules_to_build=("${BUILD_ORDER[@]}")
    fi

    # 显示构建配置
    echo ""
    log_info "=========================================="
    log_info "MeterSphere 构建配置"
    log_info "=========================================="
    log_info "项目路径: $PROJECT_PATH"
    log_info "镜像仓库: $REGISTRY"
    log_info "输出路径: $PACKAGE_PATH"
    log_info "并行构建: $PARALLEL_BUILD"
    [ "$PARALLEL_BUILD" = true ] && log_info "并行任务数: $MAX_JOBS"
    log_info "跳过初始化: $SKIP_INIT"
    log_info "只构建不导出: $BUILD_ONLY"
    log_info "不使用缓存: $NO_CACHE"
    log_info "构建模块: ${modules_to_build[*]}"
    for module in "${modules_to_build[@]}"; do
        local version="$(get_module_version "$module")"
        log_info "  - $module: ${version:-未设置!}"
    done
    log_info "=========================================="
    echo ""

    local start_time=$(date +%s)

    # 1. 检查环境
    check_environment

    # 2. 初始化依赖
    if ! init_dependencies; then
        log_error "依赖初始化失败"
        exit 1
    fi

    # 3. 构建模块
    if [ "$PARALLEL_BUILD" = true ]; then
        if ! build_modules_parallel "${modules_to_build[@]}"; then
            log_error "部分模块构建失败"
        fi
    else
        if ! build_modules_serial "${modules_to_build[@]}"; then
            log_error "部分模块构建失败"
        fi
    fi

    # 4. 导出镜像（即使部分失败也导出成功的）
    if ! export_images; then
        log_error "镜像导出失败"
        exit 1
    fi

    # 5. 显示构建总结
    show_summary "$start_time"

    # 如果有失败模块，退出码非零
    [ ${#FAILED_MODULES[@]} -gt 0 ] && exit 1
    exit 0
}

main "$@"
