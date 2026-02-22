import { useTr } from "./i18nContext";
import { Text, Layout } from "@shopify/polaris";

function example() {
    const tr = useTr();

    return (
        <Layout>
            <Text as="p">{tr("Translation example")}</Text>
        </Layout>
    );
}

export default example;
