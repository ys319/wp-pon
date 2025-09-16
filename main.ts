import dedent from "npm:dedent"

/**
 * @remarks
 * このスクリプトは、柔軟なWordPress開発環境を構築するための
 * docker-compose関連ファイルをカレントディレクトリに生成します。
 *
 * ユーザーとの対話を通じて設定を決定し、必要なファイルの生成と
 * 権限設定を自動で行います。
 *
 * 実行にはDenoランタイムと、ファイル書き込み・コマンド実行権限が必要です。
 * `deno run --allow-write --allow-run=chmod create-wp-env.ts`
 */

/**
 * ユーザーに入力を促し、設定値を取得するための型定義。
 */
type EnvConfig = {
    projectName: string
    wpVersion: string
    wpPort: string
    wpPlugins: string
}

/**
 * .envファイルのテンプレートを動的に生成する関数。
 * @param config - ユーザーが入力した設定値。
 * @returns フォーマットされた.envファイルの内容文字列。
 */
const createDotEnvTemplate = (config: EnvConfig): string => {
    return dedent`
    # .env

    # Project Settings
    PROJECT_NAME=${config.projectName}

    # WordPress Settings
    WP_VERSION=${config.wpVersion}
    WP_PORT=${config.wpPort}
    WP_PLUGINS="${config.wpPlugins}"

    # Database Settings
    MYSQL_DATABASE=wordpress
    MYSQL_USER=wordpress
    MYSQL_PASSWORD=your_strong_password
    MYSQL_ROOT_PASSWORD=your_strong_root_password
  `
}

/**
 * docker-compose.ymlファイルのテンプレート文字列。
 * 変数部分はDocker Compose側で.envファイルから読み込まれるため静的。
 */
const dockerComposeTemplate = dedent`
  # docker-compose.yml

  version: '3.8'
  name: '\${PROJECT_NAME}'

  services:
    db:
      image: mysql:8.0
      container_name: \${PROJECT_NAME}-db
      restart: always
      environment:
        MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
        MYSQL_DATABASE: \${MYSQL_DATABASE}
        MYSQL_USER: \${MYSQL_USER}
        MYSQL_PASSWORD: \${MYSQL_PASSWORD}
      volumes:
        - db_data:/var/lib/mysql
      networks:
        - wordpress_net

    wordpress:
      image: wordpress:\${WP_VERSION:-latest}
      container_name: \${PROJECT_NAME}-wordpress
      restart: always
      depends_on:
        - db
      ports:
        - "\${WP_PORT:-8080}:80"
      environment:
        WORDPRESS_DB_HOST: db:3306
        WORDPRESS_DB_USER: \${MYSQL_USER}
        WORDPRESS_DB_PASSWORD: \${MYSQL_PASSWORD}
        WORDPRESS_DB_NAME: \${MYSQL_DATABASE}
        WORDPRESS_TABLE_PREFIX: wp_
        WP_PLUGINS: \${WP_PLUGINS}
      volumes:
        - wp_data:/var/www/html
        - ./src:/var/www/html/wp-content/themes/current
        - ./init-plugins.sh:/docker-entrypoint-initwp.d/init-plugins.sh
        - ./uploads.ini:/usr/local/etc/php/conf.d/uploads.ini
        - ./timeouts.conf:/etc/apache2/conf-enabled/timeouts.conf
      networks:
        - wordpress_net

  volumes:
    db_data:
    wp_data:

  networks:
    wordpress_net:
      name: \${PROJECT_NAME}_net
`

/**
 * プラグイン初期インストール用シェルスクリプトのテンプレート文字列。
 */
const initPluginsScriptTemplate = dedent`
  #!/bin/bash
  # init-plugins.sh
  set -e
  read -r -a PLUGINS_TO_INSTALL <<< "\${WP_PLUGINS:-}"
  PLUGIN_DIR="/var/www/html/wp-content/plugins"
  for plugin_slug in "\${PLUGINS_TO_INSTALL[@]}"; do
    if [ -n "$plugin_slug" ]; then
      if [ ! -d "$PLUGIN_DIR/$plugin_slug" ]; then
        echo ">>> Installing plugin: $plugin_slug"
        wget -q -O "/tmp/$plugin_slug.zip" "https://downloads.wordpress.org/plugin/$plugin_slug.latest-stable.zip"
        if [ $? -eq 0 ]; then
          unzip -q "/tmp/$plugin_slug.zip" -d "$PLUGIN_DIR"
          rm "/tmp/$plugin_slug.zip"
          echo ">>> Plugin '$plugin_slug' installed successfully."
        else
          echo ">>> Failed to download plugin: $plugin_slug"
        fi
      else
        echo ">>> Plugin '$plugin_slug' is already installed."
      fi
    fi
  done
  echo ">>> All specified plugins have been processed."
`

/**
 * ファイル情報を格納するための型定義。
 */
type FileDefinition = {
    readonly name: string
    readonly content: string
}

/**
 * ユーザーに質問し、設定を対話的に収集する関数。
 * @returns ユーザーによって決定された設定値のPromise。
 */
const collectUserConfig = (): EnvConfig => {
    const projectName = prompt("Enter project name:", "my-wordpress") ?? "my-wordpress"
    const wpVersion = prompt("Enter WordPress version:", "latest") ?? "latest"
    const wpPort = prompt("Enter public port:", "8080") ?? "8080"
    const wpPlugins = prompt(
        "Enter plugin slugs (space separated):",
        "all-in-one-wp-migration contact-form-7"
    ) ?? ""

    return { projectName, wpVersion, wpPort, wpPlugins }
}

/**
 * 指定された内容でファイルを非同期に生成する純粋な関数。
 * @param file - 生成するファイルの名前と内容を持つオブジェクト。
 * @returns ファイル書き込みが成功した場合はvoidのPromiseを返す。
 * @throws ファイル書き込み中にエラーが発生した場合、エラーをスローする。
 */
const createFile = async (file: FileDefinition): Promise<void> => {
    try {
        await Deno.writeTextFile(file.name, file.content)
        console.log(`✅ Successfully created ${file.name}`)
    } catch (error) {
        console.error(`❌ Failed to create ${file.name}:`, error)
        throw error
    }
}

/**
 * `init-plugins.sh`に実行権限を付与する。
 * @returns 権限付与が成功した場合はvoidのPromiseを返す。
 * @throws コマンド実行中にエラーが発生した場合、エラーをスローする。
 */
const setExecutePermission = async (): Promise<void> => {
    console.log("ℹ️ Setting execute permission for init-plugins.sh...")
    try {
        const command = new Deno.Command("chmod", {
            args: ["+x", "init-plugins.sh"],
        })
        const { code, stderr } = await command.output()
        if (code !== 0) {
            // Deno.CommandのstderrはUint8Arrayなのでデコードが必要
            const errorOutput = new TextDecoder().decode(stderr)
            throw new Error(`chmod command failed with code ${code}: ${errorOutput}`)
        }
        console.log("✅ Execute permission set successfully.")
    } catch (error) {
        console.error("❌ Failed to set execute permission:", error)
        throw error
    }
}

/**
 * CLIツールのメイン処理を実行するエントリーポイント関数。
 */
const main = async (): Promise<void> => {
    console.log("🚀 Starting interactive setup for WordPress environment...")

    try {
        const userConfig = await collectUserConfig()

        const filesToCreate: readonly FileDefinition[] = [
            { name: ".env", content: createDotEnvTemplate(userConfig) },
            { name: "docker-compose.yml", content: dockerComposeTemplate },
            { name: "init-plugins.sh", content: initPluginsScriptTemplate },
        ]

        await Promise.all(filesToCreate.map(createFile))

        await setExecutePermission()

        console.log("\n🎉 Environment setup is complete!")
        console.log("\nNext step:")
        console.log("   Start the containers in detached mode:")
        console.log("   docker-compose up -d")
    } catch (_error) {
        console.error("\n💥 An error occurred during setup. Please check the logs above.")
        Deno.exit(1)
    }
}

if (import.meta.main) {
    main()
}
